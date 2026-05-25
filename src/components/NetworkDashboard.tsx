import React, { useState, useRef, useEffect } from 'react';
import { Activity, ArrowDown, ArrowUp, Globe, MoveRight, Play, RefreshCw, Server, AlertCircle, ShieldCheck, ShieldAlert, Shield, CheckCircle, Wallet, X, Users, Cookie, Radar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BrowserProvider, parseEther } from 'ethers';
import { SpeedTestResult, CustomTargetResult, SecurityTestResult } from '../types';

// ───────────────────────────────────────────────────────────────────────────
// PAYMENT_WALLET — hardcoded scan fee recipient. Cannot be changed by users.
// Server-side verification in server.ts ensures only payments to this address
// unlock premium scan results.
// ───────────────────────────────────────────────────────────────────────────
const PAYMENT_WALLET = '0x6b62122ABE518446561d3B6E58227F46214737dF';

declare global {
  interface Window {
    ethereum?: any;
  }
}

const MetricCard = ({ title, value, unit, icon: Icon, colorClass, isRunning }: { 
  title: string, value: number | null, unit: string, icon: React.ElementType, colorClass: string, isRunning?: boolean 
}) => (
  <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800 text-center relative overflow-hidden flex flex-col justify-center min-h-[120px]">
    {isRunning && (
      <motion.div
         animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
         transition={{ repeat: Infinity, duration: 1.5 }}
         className={`absolute top-4 right-4 w-2 h-2 rounded-full ${colorClass.split(' ')[0].replace('text-', 'bg-')}`}
      />
    )}
    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">{title}</p>
    <p className={`text-2xl font-black ${value !== null ? colorClass : 'text-slate-600'}`}>
      {value !== null ? value.toFixed(value % 1 === 0 ? 0 : 2) : '---'} <span className="text-xs font-bold text-slate-500">{unit}</span>
    </p>
  </div>
);

export default function NetworkDashboard() {
  const [activeTab, setActiveTab] = useState<'standard' | 'custom' | 'security'>('standard');
  
  // Standard Test State
  const [standardTest, setStandardTest] = useState<SpeedTestResult>({
    ping: null, download: null, upload: null, status: 'idle'
  });

  // Custom Target State
  const [customUrl, setCustomUrl] = useState('example.com');
  const [customTest, setCustomTest] = useState<CustomTargetResult>({
    ping: null, downloadTimeMs: null, downloadSpeedMbps: null, sizeBytes: null, statusCode: null, status: 'idle'
  });

  // Security Test State
  const [securityUrl, setSecurityUrl] = useState('');
  const [securityTest, setSecurityTest] = useState<SecurityTestResult>({
    riskLevel: null, reasons: [], status: 'idle'
  });

  // Web3 State
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [currentChainId, setCurrentChainId] = useState<string | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  useEffect(() => {
    if (window.ethereum) {
      const handleChainChanged = (chainId: string) => {
        setCurrentChainId(BigInt(chainId).toString());
      };
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) setWalletAddress(accounts[0]);
        else setWalletAddress(null);
      };
      
      window.ethereum.on('chainChanged', handleChainChanged);
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      
      // Get initial chainId on mount if available
      window.ethereum.request({ method: 'eth_chainId' }).then((id: string) => {
        setCurrentChainId(BigInt(id).toString());
      }).catch(() => {});
      
      return () => {
        window.ethereum.removeListener('chainChanged', handleChainChanged);
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      }
    }
  }, []);

  const isSupportedNetwork = currentChainId === '137' || currentChainId === '8453';
  const networkName = currentChainId === '137' ? 'Polygon' : currentChainId === '8453' ? 'Base' : 'Unsupported Network';

  const runStandardTest = async () => {
    setStandardTest({ ping: null, download: null, upload: null, status: 'running' });
    
    try {
      const pingStart = performance.now();
      await fetch('/api/health').catch(() => {});
      const pingEnd = performance.now();
      const pingMs = pingEnd - pingStart;
      setStandardTest(prev => ({ ...prev, ping: pingMs }));

      const dlStart = performance.now();
      const response = await fetch('/api/speedtest/download?size=10');
      const blob = await response.blob();
      const dlEnd = performance.now();
      const dlTimeSec = (dlEnd - dlStart) / 1000;
      const dlMbps = (blob.size * 8) / dlTimeSec / 1000000;
      setStandardTest(prev => ({ ...prev, download: dlMbps }));

      const payloadSize = 5 * 1024 * 1024;
      const uploadBuffer = new Uint8Array(payloadSize);
      for(let i = 0; i < uploadBuffer.length; i++) {
        uploadBuffer[i] = Math.floor(Math.random() * 256);
      }
      
      const ulStart = performance.now();
      await fetch('/api/speedtest/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: uploadBuffer
      });
      const ulEnd = performance.now();
      const ulTimeSec = (ulEnd - ulStart) / 1000;
      const ulMbps = (payloadSize * 8) / ulTimeSec / 1000000;
      
      setStandardTest(prev => ({ ...prev, upload: ulMbps, status: 'completed' }));
    } catch (err: any) {
      setStandardTest(prev => ({ ...prev, status: 'error', errorDetails: err.message || 'Network error occurred' }));
    }
  };

  const runCustomTest = async () => {
    if (!customUrl.trim()) return;
    setCustomTest({ ping: null, downloadTimeMs: null, downloadSpeedMbps: null, sizeBytes: null, statusCode: null, status: 'running' });
    
    try {
      const res = await fetch('/api/proxy/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: customUrl })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to connect to the target website');
      }

      setCustomTest({
        status: 'completed',
        ping: data.ping,
        downloadTimeMs: data.downloadTimeMs,
        downloadSpeedMbps: data.downloadSpeedMbps,
        sizeBytes: data.sizeBytes,
        statusCode: data.statusCode
      });

    } catch (err: any) {
      setCustomTest(prev => ({ ...prev, status: 'error', errorDetails: err.message || 'Connection failed' }));
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("MetaMask (or compatible Web3 EVM wallet) not detected!");
      return;
    }
    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      if (accounts.length > 0) {
        setWalletAddress(accounts[0]);
        const network = await provider.getNetwork();
        setCurrentChainId(network.chainId.toString());
        setShowWalletModal(false);
      }
    } catch (err) {
      console.error("Wallet connection failed", err);
    }
  };

  const switchNetwork = async (networkKey: 'polygon' | 'base') => {
    if (!window.ethereum) return;
    const networks = {
      polygon: {
        chainId: '0x89',
        chainName: 'Polygon Mainnet',
        nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
        rpcUrls: ['https://polygon-rpc.com/'],
        blockExplorerUrls: ['https://polygonscan.com/']
      },
      base: {
        chainId: '0x2105',
        chainName: 'Base',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://mainnet.base.org'],
        blockExplorerUrls: ['https://basescan.org']
      }
    };
    
    const targetNetwork = networks[networkKey];
    
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetNetwork.chainId }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [targetNetwork],
          });
        } catch (addError) {
          console.error("Failed to add network", addError);
        }
      } else {
        console.error("Failed to switch network", switchError);
      }
    }
  };

  const payAndScan = async () => {
    if (!window.ethereum || !walletAddress || !securityUrl.trim()) return;
    if (!isSupportedNetwork) {
       alert("Please switch to Polygon or Base network first.");
       return;
    }
    setIsProcessingPayment(true);
    setSecurityTest({ riskLevel: null, reasons: [], status: 'running' });
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const feeAmount = parseEther("0.0001"); // 0.0001 Native Token (e.g., POL, ETH)
      
      const tx = await signer.sendTransaction({
        to: PAYMENT_WALLET, // hardcoded — server verifies this on-chain
        value: feeAmount
      });
      
      // Tunggu hingga transaksi tercatat di blockchain (Mining)
      const receipt = await tx.wait();
      
      // Lanjutkan ke scanning dengan memberikan bukti pembayaran (tx hash)
      await runSecurityTest(receipt.hash);
    } catch (err: any) {
      setSecurityTest(prev => ({ ...prev, status: 'error', errorDetails: "Transaction cancelled or failed: " + err.message }));
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const runSecurityTest = async (txHash?: string) => {
    // Note: status is set to 'running' in payAndScan, unless called directly
    if (securityTest.status !== 'running') {
      setSecurityTest({ riskLevel: null, reasons: [], status: 'running' });
    }

    try {
      const res = await fetch('/api/security/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: securityUrl, txHash: txHash || '0x_mock_hash', chainId: currentChainId })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze website');
      }

      setSecurityTest({
        status: 'completed',
        riskLevel: data.riskLevel,
        reasons: data.reasons || [],
        estimatedMonthlyVisits: data.estimatedMonthlyVisits,
        trackersCount: data.trackersCount,
        thirdPartyCookies: data.thirdPartyCookies,
        isPremium: data.isPremium
      });

    } catch (err: any) {
      setSecurityTest(prev => ({ ...prev, status: 'error', errorDetails: err.message || 'Security check failed' }));
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center">
      
      <div className="flex gap-1 bg-slate-900/50 p-1 rounded-full border border-slate-800 mb-12">
        <button 
          onClick={() => setActiveTab('standard')}
          className={`px-6 py-2 rounded-full text-sm font-bold transition-all shadow-lg ${
            activeTab === 'standard' ? 'bg-indigo-600 text-white shadow-indigo-500/20' : 'text-slate-400 hover:text-white shadow-transparent bg-transparent'
          }`}
        >
          Node Target
        </button>
        <button 
          onClick={() => setActiveTab('custom')}
          className={`px-6 py-2 rounded-full text-sm font-bold transition-all shadow-lg ${
            activeTab === 'custom' ? 'bg-indigo-600 text-white shadow-indigo-500/20' : 'text-slate-400 hover:text-white shadow-transparent bg-transparent'
          }`}
        >
          Custom Target
        </button>
        <button 
          onClick={() => setActiveTab('security')}
          className={`px-6 py-2 rounded-full text-sm font-bold transition-all shadow-lg ${
            activeTab === 'security' ? 'bg-indigo-600 text-white shadow-indigo-500/20' : 'text-slate-400 hover:text-white shadow-transparent bg-transparent'
          }`}
        >
          Security Scanner
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'standard' && (
          <motion.div 
            key="standard"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full flex flex-col items-center"
          >
            <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 w-full max-w-4xl">
              <MetricCard 
                title="Ping" 
                value={standardTest.ping} 
                unit="ms" 
                icon={Activity} 
                colorClass="text-cyan-400"
                isRunning={standardTest.status === 'running' && standardTest.ping === null}
              />
              <MetricCard 
                title="Download" 
                value={standardTest.download} 
                unit="Mbps" 
                icon={ArrowDown} 
                colorClass="text-indigo-400"
                isRunning={standardTest.status === 'running' && standardTest.download === null && standardTest.ping !== null}
              />
              <MetricCard 
                title="Upload" 
                value={standardTest.upload} 
                unit="Mbps" 
                icon={ArrowUp} 
                colorClass="text-purple-400"
                isRunning={standardTest.status === 'running' && standardTest.upload === null && standardTest.download !== null}
              />
            </div>
            
            <button
              onClick={runStandardTest}
              disabled={standardTest.status === 'running'}
              className="mt-12 w-full max-w-sm h-16 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl font-black text-lg tracking-wide hover:brightness-110 shadow-xl shadow-indigo-600/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-white transition-all uppercase"
            >
              {standardTest.status === 'running' ? (
                <RefreshCw className="animate-spin" size={20} />
              ) : (
                <Play className="fill-white" size={20} />
              )}
              <span>{standardTest.status === 'running' ? 'Testing...' : 'Re-Run Test'}</span>
            </button>

            {standardTest.errorDetails && (
              <div className="mt-8 flex items-center space-x-2 text-red-400 bg-red-400/10 px-4 py-3 rounded-lg border border-red-500/20">
                <AlertCircle size={18} />
                <span className="font-sans text-sm">{standardTest.errorDetails}</span>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'custom' && (
          <motion.div 
             key="custom"
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             exit={{ opacity: 0, y: -10 }}
             className="w-full flex flex-col items-center"
           >
             
             <div className="w-full max-w-xl relative mb-12">
               <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                 <Globe className="text-gray-500" size={20} />
               </div>
               <input
                 type="text"
                 placeholder="Enter website URL (e.g., example.com)"
                 value={customUrl}
                 onChange={(e) => setCustomUrl(e.target.value)}
                 disabled={customTest.status === 'running'}
                 className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-12 pr-32 text-sm font-mono text-cyan-300 focus:outline-none focus:border-indigo-500 transition-all"
               />
               <button
                 onClick={runCustomTest}
                 disabled={customTest.status === 'running' || !customUrl.trim()}
                 className="absolute inset-y-2 right-2 px-6 rounded-lg font-bold text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider flex items-center"
               >
                 {customTest.status === 'running' ? <RefreshCw className="animate-spin" size={16} /> : 'Connect'}
               </button>
             </div>

             <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
               <MetricCard 
                 title="Latency (TTFB)" 
                 value={customTest.ping} 
                 unit="ms" 
                 icon={Server} 
                 colorClass="text-cyan-400"
                 isRunning={customTest.status === 'running'}
               />
               <MetricCard 
                 title="Est. Speed" 
                 value={customTest.downloadSpeedMbps} 
                 unit="Mbps" 
                 icon={ArrowDown} 
                 colorClass="text-indigo-400"
                 isRunning={customTest.status === 'running'}
               />
               <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between relative min-h-[120px]">
                 <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center mb-1">Remote Server</p>
                 <div className="flex flex-col space-y-1 mt-auto px-4 pb-2">
                   <div className="flex justify-between items-end">
                     <span className="text-[10px] text-slate-500 font-bold uppercase">Status</span>
                     <span className={`font-mono text-sm font-bold ${customTest.statusCode === 200 ? 'text-white' : customTest.statusCode ? 'text-amber-400' : 'text-slate-600'}`}>
                       {customTest.statusCode || '---'}
                     </span>
                   </div>
                   <div className="flex justify-between items-end">
                     <span className="text-[10px] text-slate-500 font-bold uppercase">Size</span>
                     <span className="font-mono text-white text-sm font-bold">
                       {customTest.sizeBytes ? `${(customTest.sizeBytes / 1024).toFixed(1)} KB` : '---'}
                     </span>
                   </div>
                 </div>
               </div>
             </div>

            {customTest.errorDetails && (
              <div className="mt-8 flex items-center space-x-2 text-red-400 bg-red-400/10 px-4 py-3 rounded-lg border border-red-500/20">
                <AlertCircle size={18} />
                <span className="font-sans text-sm">{customTest.errorDetails}</span>
              </div>
            )}
           </motion.div>
        )}

        {activeTab === 'security' && (
          <motion.div 
             key="security"
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             exit={{ opacity: 0, y: -10 }}
             className="w-full flex flex-col items-center"
           >
             <div className="w-full max-w-xl relative mb-8">
               <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                 <Shield className="text-gray-500" size={20} />
               </div>
               <input
                 type="text"
                 placeholder="Enter website URL for security analysis"
                 value={securityUrl}
                 onChange={(e) => setSecurityUrl(e.target.value)}
                 disabled={securityTest.status === 'running' || isProcessingPayment}
                 className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-12 pr-4 text-sm font-mono text-cyan-300 focus:outline-none focus:border-indigo-500 transition-all"
               />
             </div>

             {!walletAddress ? (
               <div className="flex gap-4 mb-12">
                 <button onClick={() => setShowWalletModal(true)} className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-purple-500/20">
                    <Wallet size={18} /> Connect Web3 Wallet
                 </button>
                 <button 
                   onClick={() => runSecurityTest('0x_mock_hash')} 
                   disabled={!securityUrl.trim() || securityTest.status === 'running'} 
                   className="px-8 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 rounded-xl font-bold flex items-center gap-2 transition-all"
                 >
                   <Shield size={18} />
                   Test Mode (Free)
                 </button>
               </div>
             ) : (
               <div className="flex flex-col items-center gap-4 mb-12">
                 <div className="flex flex-wrap justify-center items-center gap-2 mb-2">
                   <div className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-400 flex items-center gap-2">
                     <Wallet size={14} className="text-indigo-400" />
                     <span className="text-cyan-400">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
                   </div>
                   <div className={`px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-bold flex items-center gap-2 ${isSupportedNetwork ? 'text-emerald-400' : 'text-red-400'}`}>
                      <div className={`w-2 h-2 rounded-full ${isSupportedNetwork ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}></div>
                      {networkName}
                   </div>
                 </div>

                 {!isSupportedNetwork ? (
                   <div className="flex gap-2">
                     <button onClick={() => switchNetwork('polygon')} className="px-6 py-3 bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl font-bold transition-all text-sm">
                       Switch to Polygon
                     </button>
                     <button onClick={() => switchNetwork('base')} className="px-6 py-3 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 rounded-xl font-bold transition-all text-sm">
                       Switch to Base
                     </button>
                   </div>
                 ) : (
                   <div className="flex gap-4">
                     <button 
                       onClick={payAndScan} 
                       disabled={!securityUrl.trim() || isProcessingPayment || securityTest.status === 'running'} 
                       className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
                     >
                       {isProcessingPayment || securityTest.status === 'running' ? <RefreshCw className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
                       {isProcessingPayment ? 'Processing...' : securityTest.status === 'running' ? 'Scanning...' : `Pay 0.0001 ${currentChainId === '137' ? 'POL' : 'ETH'} to Scan`}
                     </button>
                     <button 
                       onClick={() => runSecurityTest('0x_mock_hash')} 
                       disabled={!securityUrl.trim() || securityTest.status === 'running'} 
                       className="px-8 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 rounded-xl font-bold flex items-center gap-2 transition-all"
                     >
                       <Shield size={18} />
                       Test Mode (Free)
                     </button>
                   </div>
                 )}
               </div>
             )}

             {securityTest.status === 'completed' && securityTest.riskLevel && (
                <div className={`w-full max-w-xl p-8 rounded-2xl border ${
                  securityTest.riskLevel === 'safe' ? 'bg-emerald-950/20 border-emerald-500/50' :
                  securityTest.riskLevel === 'low' ? 'bg-blue-950/20 border-blue-500/50' :
                  securityTest.riskLevel === 'medium' ? 'bg-amber-950/20 border-amber-500/50' :
                  'bg-red-950/30 border-red-500/50'
                }`}>
                  <div className="flex items-start space-x-4">
                    {securityTest.riskLevel === 'safe' || securityTest.riskLevel === 'low' ? (
                      <CheckCircle className="text-emerald-400 mt-1 flex-shrink-0" size={28} />
                    ) : (
                      <ShieldAlert className={`${securityTest.riskLevel === 'high' ? 'text-red-400' : 'text-amber-400'} mt-1 flex-shrink-0`} size={28} />
                    )}
                    <div>
                      <h3 className={`text-xl font-bold uppercase tracking-widest ${
                        securityTest.riskLevel === 'safe' ? 'text-emerald-400' :
                        securityTest.riskLevel === 'low' ? 'text-blue-400' :
                        securityTest.riskLevel === 'medium' ? 'text-amber-400' :
                        'text-red-400'
                      }`}>
                        Risk Level: {securityTest.riskLevel}
                      </h3>
                      <div className="mt-4 space-y-2">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                            <div className={`flex items-center space-x-3 text-slate-300 p-3 rounded-lg border ${!securityTest.isPremium ? 'bg-slate-950/50 border-slate-800/50 opacity-80' : 'bg-slate-900/50 border-slate-700/50'}`}>
                              <Users className={securityTest.isPremium ? "text-cyan-400" : "text-slate-500"} size={20} />
                              <div>
                                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Est. Traffic</div>
                                <div className={`text-sm font-bold ${securityTest.isPremium ? 'text-cyan-300 font-mono' : 'text-slate-500 text-xs mt-0.5'}`}>
                                  {securityTest.isPremium ? securityTest.estimatedMonthlyVisits : 'Premium Only'}
                                </div>
                              </div>
                            </div>
                            <div className={`flex items-center space-x-3 text-slate-300 p-3 rounded-lg border ${!securityTest.isPremium ? 'bg-slate-950/50 border-slate-800/50 opacity-80' : 'bg-slate-900/50 border-slate-700/50'}`}>
                              <Radar className={securityTest.isPremium ? "text-purple-400" : "text-slate-500"} size={20} />
                              <div>
                                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Ad Trackers</div>
                                <div className={`text-sm font-bold ${securityTest.isPremium ? 'text-purple-300 font-mono' : 'text-slate-500 text-xs mt-0.5'}`}>
                                  {securityTest.isPremium ? `${securityTest.trackersCount} Detect` : 'Premium Only'}
                                </div>
                              </div>
                            </div>
                            <div className={`flex items-center space-x-3 text-slate-300 p-3 rounded-lg border ${!securityTest.isPremium ? 'bg-slate-950/50 border-slate-800/50 opacity-80' : 'bg-slate-900/50 border-slate-700/50'}`}>
                              <Cookie className={securityTest.isPremium ? (securityTest.thirdPartyCookies ? "text-amber-400" : "text-emerald-400") : "text-slate-500"} size={20} />
                              <div>
                                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">3rd Party Cookies</div>
                                <div className={`text-sm font-bold ${!securityTest.isPremium ? 'text-slate-500 text-xs mt-0.5' : securityTest.thirdPartyCookies ? 'text-amber-300' : 'text-emerald-300'}`}>
                                  {!securityTest.isPremium ? 'Premium Only' : securityTest.thirdPartyCookies ? 'Present' : 'None'}
                                </div>
                              </div>
                            </div>
                          </div>
                        <div className="pt-2">
                          {securityTest.reasons.map((reason, i) => (
                            <div key={i} className="flex items-start space-x-2 text-slate-300 mb-1">
                              <span className="text-indigo-400 font-bold mt-[2px]">•</span>
                              <span className="text-sm leading-relaxed">{reason}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
             )}

            {securityTest.errorDetails && (
              <div className="mt-8 flex items-center space-x-2 text-red-400 bg-red-400/10 px-4 py-3 rounded-lg border border-red-500/20 w-full max-w-xl">
                <AlertCircle size={18} />
                <span className="font-sans text-sm">{securityTest.errorDetails}</span>
              </div>
            )}
           </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showWalletModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">Connect Wallet</h2>
                <button onClick={() => setShowWalletModal(false)} className="text-slate-400 hover:text-white p-2">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-3 relative z-10">
                <button onClick={connectWallet} className="w-full bg-slate-800 hover:bg-slate-700/80 border border-slate-700 p-4 rounded-xl flex items-center justify-between transition-all group shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg outline outline-1 outline-slate-600 overflow-hidden bg-white flex items-center justify-center">
                       <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" className="w-6 h-6 object-contain" />
                    </div>
                    <span className="font-bold text-white group-hover:text-indigo-400 transition-colors">MetaMask</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-950 border border-slate-800 px-2 py-1 rounded-md uppercase tracking-wider">Popular</span>
                </button>

                <button onClick={connectWallet} className="w-full bg-slate-800 hover:bg-slate-700/80 border border-slate-700 p-4 rounded-xl flex items-center justify-between transition-all group shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg outline outline-1 outline-slate-600 overflow-hidden bg-blue-600 flex items-center justify-center">
                       <div className="w-4 h-4 rounded-full border-2 border-white"></div>
                    </div>
                    <span className="font-bold text-white group-hover:text-indigo-400 transition-colors">Coinbase Wallet</span>
                  </div>
                </button>
                
                <button onClick={connectWallet} className="w-full bg-slate-800 hover:bg-slate-700/80 border border-slate-700 p-4 rounded-xl flex items-center justify-between transition-all group shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg outline outline-1 outline-slate-600 overflow-hidden bg-slate-100 flex items-center justify-center">
                       <Globe size={18} className="text-slate-800" />
                    </div>
                    <span className="font-bold text-white group-hover:text-indigo-400 transition-colors">Browser Wallet</span>
                  </div>
                </button>
              </div>
              
              <div className="mt-8 text-center px-4 relative z-10">
                <p className="text-[10px] text-slate-500 font-bold tracking-widest leading-relaxed">
                  By connecting a wallet, you agree to Velocity.io's <a href="#" className="text-indigo-400 hover:underline">Terms of Service</a>.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
