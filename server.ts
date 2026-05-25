import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT_WALLET — the ONLY address that qualifies as valid scan fee payment.
// Verified on-chain in /api/security/check. Users cannot override this.
// ─────────────────────────────────────────────────────────────────────────────
const PAYMENT_WALLET = '0x6b62122ABE518446561d3B6E58227F46214737dF';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for upload tests
  app.use(express.json({ limit: '50mb' }));
  app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));

  // API Routes
  app.get('/api/health', (req, res) => res.sendStatus(200));
  
  // 1. Download Test (Backend -> Client)
  app.get('/api/speedtest/download', (req, res) => {
    // Generate a payload of requested size in MB, max 10MB
    const sizeInMb = Math.min(Number(req.query.size) || 1, 10);
    const bytes = sizeInMb * 1024 * 1024;
    
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', bytes.toString());
    
    // Send random data pattern to bypass compression
    const buffer = Buffer.alloc(bytes);
    for (let i = 0; i < bytes; i += 1024) {
      buffer.write(Math.random().toString(), i, Math.min(1024, bytes - i));
    }
    
    res.send(buffer);
  });

  // 2. Upload Test (Client -> Backend)
  app.post('/api/speedtest/upload', (req, res) => {
    // We just acknowledge receipt
    const size = req.body ? req.body.length : 0;
    res.json({ status: 'ok', bytesReceived: size });
  });

  // 3. Proxy Test (Backend -> Custom URL)
  app.post('/api/proxy/test', async (req, res) => {
    const { url } = req.body;
    if (!url) {
       res.status(400).json({ error: 'URL is required' });
       return;
    }

    try {
      // Benchmark start
      const start = performance.now();
      
      const targetUrl = url.startsWith('http') ? url : `https://${url}`;
      
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Nodejs-SpeedTest-Proxy/1.0'
        }
      });
      
      const pingEnd = performance.now();
      const pingMs = pingEnd - start;

      const buffer = await response.arrayBuffer();
      const downloadEnd = performance.now();
      
      const byteSize = buffer.byteLength;
      const downloadTimeMs = downloadEnd - pingEnd;
      
      // Speed in Mbps: (bytes * 8) / (ms / 1000) / 1000000
      let downloadSpeedMbps = 0;
      if (downloadTimeMs > 0 && byteSize > 0) {
          downloadSpeedMbps = (byteSize * 8) / (downloadTimeMs / 1000) / 1000000;
      }

      res.json({
        ping: Math.round(pingMs),
        sizeBytes: byteSize,
        downloadTimeMs: Math.round(downloadTimeMs),
        downloadSpeedMbps: downloadSpeedMbps,
        statusCode: response.status
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch the custom URL' });
    }
  });

  // 4. Security Check (URL & HTML heuristic analysis with Blockchain Verification)
  app.post('/api/security/check', async (req, res) => {
    const { url, txHash, chainId } = req.body;
    if (!url) {
       res.status(400).json({ error: 'URL is required' });
       return;
    }

    // --- BLOCKCHAIN VERIFICATION SYSTEM ---
    if (!txHash) {
       res.status(401).json({ error: 'Payment transaction hash is required for scanning.' });
       return;
    }

    const isPremium = txHash !== '0x_mock_hash';

    if (isPremium) {
      if (!chainId) {
         res.status(400).json({ error: 'Chain ID is required for verification.' });
         return;
      }
      try {
        const { JsonRpcProvider } = await import('ethers');
        
        // Connect to respective nodes
        const rpcUrl = chainId === '137' ? 'https://polygon-rpc.com' : 'https://mainnet.base.org';
        const provider = new JsonRpcProvider(rpcUrl);
        
        // Fetch the transaction from the blockchain
        const tx = await provider.getTransaction(txHash);
        if (!tx) {
           res.status(400).json({ error: 'Transaction not found on the blockchain.' });
           return;
        }

        // VERIFY DESTINATION WALLET — must match the hardcoded PAYMENT_WALLET
        if (tx.to?.toLowerCase() !== PAYMENT_WALLET.toLowerCase()) {
           res.status(403).json({ error: 'Invalid payment destination. Transaction must be sent to the official EtherPulse scan wallet.' });
           return;
        }
      } catch (verifyErr: any) {
        res.status(500).json({ error: 'Blockchain verification error: ' + verifyErr.message });
        return;
      }
    }
    // --------------------------------------

    try {
      const targetUrl = url.startsWith('http') ? url : `https://${url}`;
      let html = '';
      try {
        const response = await fetch(targetUrl, { signal: AbortSignal.timeout(5000) });
        const text = await response.text();
        html = text.slice(0, 5000); // 5KB sample for analysis
      } catch (e) {
        // Continue even if we can't fetch the HTML, maybe analyze domain only
      }

      if (process.env.GEMINI_API_KEY) {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        const prompt = `Analyze this URL and its partial HTML context for potential phishing, scams, or malware.
URL: ${targetUrl}
HTML (partial):
${html}

Respond in strict JSON format only with the following schema:
{ 
  "riskLevel": "safe" | "low" | "medium" | "high", 
  "reasons": ["reason1", "reason2"],
  "estimatedMonthlyVisits": "< 10K" | "10K - 100K" | "100K - 1M" | "> 1M" | "Unknown",
  "trackersCount": 0 /* return an estimated number of ad trackers based on domain type */,
  "thirdPartyCookies": false /* boolean indicating if third party cookies are likely used */
}

Return "safe" if it is a well-known legitimate site. Estimate the monthly visits based on domain popularity. If the HTML is missing or empty, analyze based purely on the domain properties and naming patterns.`;
        
        const aiRes = await ai.models.generateContent({
           model: 'gemini-2.5-flash',
           contents: prompt,
           config: {
             responseMimeType: 'application/json',
           }
        });
        
        const data = JSON.parse(aiRes.text || '{}');
        
        if (!isPremium) {
           data.reasons = data.reasons && data.reasons.length > 0 ? [data.reasons[0], 'Unlock Premium for more detailed insights.'] : ['Unlock Premium for detailed insights.'];
           delete data.estimatedMonthlyVisits;
           delete data.trackersCount;
           delete data.thirdPartyCookies;
        }
        data.isPremium = isPremium;

        res.json(data);
      } else {
         // Fallback basic heuristic
         const isSuspicious = targetUrl.includes('free') || targetUrl.includes('money') || targetUrl.endsWith('.xyz') || targetUrl.endsWith('.tk');
         res.json({
            riskLevel: isSuspicious ? 'high' : 'medium',
            reasons: isSuspicious 
              ? [`Suspicious domain patterns detected (${targetUrl}).`] 
              : ['Gemini API key not configured. Deep heuristic analysis unavailable. Proceed with caution.'],
            estimatedMonthlyVisits: isPremium ? "Unknown (API Not Configured)" : undefined,
            trackersCount: isPremium ? Math.floor(Math.random() * 15) : undefined,
            thirdPartyCookies: isPremium ? Math.random() > 0.5 : undefined,
            isPremium
         });
      }
    } catch (err: any) {
       res.status(500).json({ error: err.message || 'Failed to scan the URL' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Setup for production
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
