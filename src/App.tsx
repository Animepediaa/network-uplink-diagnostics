/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import NetworkDashboard from './components/NetworkDashboard';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col selection:bg-indigo-500/30 overflow-hidden relative">
      <header className="flex justify-between items-center px-8 py-5 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <span className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-200 to-indigo-400">ETHERPULSE.AI</span>
            <span className="ml-2 text-[9px] font-bold text-cyan-400 border border-cyan-400/30 bg-cyan-400/5 px-2 py-0.5 rounded-full uppercase tracking-wider">
              Secure v2.0
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-800/80 px-3.5 py-1.5 rounded-xl">
          <div className="text-right">
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-none">Diagnostic Node</p>
            <p className="text-xs font-mono text-cyan-400 font-bold">Local Host</p>
          </div>
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-500 animate-pulse"></div>
        </div>
      </header>

      <main className="flex-1 flex flex-col px-8 pb-8 pt-4 overflow-y-auto relative z-10 w-full max-w-7xl mx-auto">
        <NetworkDashboard />
      </main>
    </div>
  );
}
