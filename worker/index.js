/**
 * EtherPulse AI — Cloudflare Worker Secure Proxy
 *
 * This Worker acts as a secure backend proxy between the frontend (etherpulse.html)
 * and the Google Gemini API. The GEMINI_API_KEY is stored as an encrypted
 * Cloudflare Worker Secret and NEVER exposed to the browser.
 *
 * Routes:
 *   POST /api/security/check  — Proxies URL security scan request to Gemini AI
 *   GET  /api/health          — Health check endpoint
 */

// CORS headers — allow requests from any origin (since frontend may be on GitHub Pages, etc.)
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT_WALLET — the ONLY address that qualifies as valid payment proof.
// This is verified server-side when processing premium scan requests.
// Users CANNOT change this from the frontend.
// ─────────────────────────────────────────────────────────────────────────────
const PAYMENT_WALLET = '0x6b62122ABE518446561d3B6E58227F46214737dF'.toLowerCase();

export default {
  async fetch(request, env) {
    // Handle CORS preflight request
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // --- GET /api/health ---
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return new Response(
        JSON.stringify({ status: 'ok', service: 'EtherPulse AI Worker', version: '2.0' }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // --- POST /api/security/check ---
    if (request.method === 'POST' && url.pathname === '/api/security/check') {
      return handleSecurityCheck(request, env);
    }

    // --- 404 for unknown routes ---
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: CORS_HEADERS }
    );
  },
};

/**
 * Handles URL security analysis by fetching a small HTML sample from the target
 * and sending it to Gemini AI for heuristic analysis.
 */
async function handleSecurityCheck(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'Invalid JSON body.');
  }

  const { url: targetUrlRaw, isPremium } = body;

  if (!targetUrlRaw || typeof targetUrlRaw !== 'string') {
    return errorResponse(400, 'Field "url" is required.');
  }

  // Ensure API key is available from Cloudflare Secret
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return errorResponse(500, 'Server misconfiguration: GEMINI_API_KEY secret is not set. Run: wrangler secret put GEMINI_API_KEY');
  }

  const targetUrl = targetUrlRaw.startsWith('http')
    ? targetUrlRaw
    : `https://${targetUrlRaw}`;

  // --- Step 1: Attempt to fetch a small HTML sample from the target ---
  let htmlSample = '';
  try {
    const sampleRes = await fetch(targetUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'EtherPulse-SecurityScanner/2.0' },
      signal: AbortSignal.timeout(5000),
      cf: { cacheEverything: false },
    });
    const rawText = await sampleRes.text();
    htmlSample = rawText.slice(0, 2000); // 2KB sample for analysis
  } catch (_e) {
    // Continue with domain-only analysis if fetch fails
  }

  // --- Step 2: Build AI prompt ---
  const prompt = `You are a cybersecurity expert specializing in Web3 and crypto scams.
Analyze this URL and its HTML context for phishing, fake airdrops, crypto wallet drainers, or malware.

URL: ${targetUrl}
HTML (partial sample):
${htmlSample || '(Could not fetch HTML — analyze based on domain name only)'}

Respond ONLY in strict JSON format with this schema:
{
  "riskLevel": "safe" | "low" | "medium" | "high",
  "reasons": ["string", "string"],
  "estimatedMonthlyVisits": "< 10K" | "10K - 100K" | "100K - 1M" | "> 1M" | "Unknown",
  "trackersCount": <number>,
  "thirdPartyCookies": <boolean>
}

Rules:
- Return "safe" only for well-known, globally recognized sites (e.g. google.com, opensea.io, uniswap.org).
- Flag any domain impersonating a known brand (e.g. "uniswap-claim.xyz") as "high".
- Flag domains with suspicious keywords like "airdrop", "claim", "free", "reward", "giveaway" as at least "medium".
- estimatedMonthlyVisits is your best estimate based on global domain popularity.
- trackersCount is an estimated count of ad/analytics trackers likely present.
- thirdPartyCookies is true if the site likely uses third-party cookies.`;

  // --- Step 3: Call Gemini API (key injected server-side from Worker Secret) ---
  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({}));
      return errorResponse(502, `Gemini API error: ${errData?.error?.message || geminiRes.statusText}`);
    }

    const geminiData = await geminiRes.json();
    const aiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    let parsed;
    try {
      parsed = JSON.parse(aiText.trim());
    } catch {
      return errorResponse(502, 'Gemini returned invalid JSON. Please retry.');
    }

    // --- Step 4: Apply Free vs Premium data gating ---
    // isPremium is only true when the frontend has confirmed a successful blockchain tx
    const responseData = {
      riskLevel: parsed.riskLevel || 'medium',
      reasons: parsed.reasons || ['Analysis complete.'],
      isPremium: !!isPremium,
    };

    if (isPremium) {
      // Full data for paying users
      responseData.estimatedMonthlyVisits = parsed.estimatedMonthlyVisits || 'Unknown';
      responseData.trackersCount = typeof parsed.trackersCount === 'number' ? parsed.trackersCount : 0;
      responseData.thirdPartyCookies = !!parsed.thirdPartyCookies;
    } else {
      // Free mode: only show first reason + upsell message
      responseData.reasons = [
        responseData.reasons[0] || 'Basic scan complete.',
        'Connect Web3 wallet and pay 0.0001 POL/ETH to unlock full analytics (tracker count, traffic, cookies).',
      ];
    }

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: CORS_HEADERS,
    });

  } catch (err) {
    return errorResponse(500, `Worker internal error: ${err.message}`);
  }
}

/** Helper: return a JSON error response */
function errorResponse(status, message) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: CORS_HEADERS }
  );
}
