import { Link } from 'react-router-dom';
import { TrendingUp, Shield, Briefcase, FileText, DollarSign, Activity } from 'lucide-react';

export default function DealsLanding() {
  return (
    <div className="min-h-screen bg-[#0f1117]">
      <nav className="flex items-center justify-between px-6 py-4 bg-[#0a0d12] border-b border-[#2a2d35]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#1D9E75] rounded-md flex items-center justify-center"><TrendingUp size={14} color="white" /></div>
          <span className="font-semibold text-sm text-white">Aprisys</span>
          <span className="text-xs text-[#555]">Deal Platform</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm text-[#888] hover:text-white">Sign in</Link>
          <Link to="/register" className="btn-teal text-xs">Register as professional</Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <p className="text-xs font-medium text-[#1D9E75] uppercase tracking-widest mb-4">Nigerian Capital Markets</p>
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
          Structured deal execution<br/>for capital markets
        </h1>
        <p className="text-lg text-[#888] mb-8 max-w-xl mx-auto">
          From signal to settlement — create deals, negotiate in secure deal rooms, and execute with conditional escrow. Built for Nigerian brokers, fund managers, and institutional investors.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link to="/register" className="btn-teal px-8 py-3 text-base">Register as a professional</Link>
          <Link to="/" className="text-sm text-[#555] hover:text-white">For individual investors →</Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 pb-16">
        {/* Deal flow */}
        <div className="bg-[#1a1d24] border border-[#2a2d35] rounded-xl p-6 mb-10">
          <p className="text-xs text-[#555] uppercase tracking-widest mb-4 text-center">End-to-end deal flow</p>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {['Signal', 'Create deal', 'Invite parties', 'Negotiate', 'Fund escrow', 'Execute'].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className="text-center">
                  <div className="w-8 h-8 bg-[#1D9E75]/20 text-[#1D9E75] rounded-lg flex items-center justify-center text-xs font-semibold mx-auto mb-1">{i + 1}</div>
                  <p className="text-xs text-[#888]">{step}</p>
                </div>
                {i < 5 && <span className="text-[#2a2d35] text-lg">›</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {[
            { icon: Briefcase, t: 'Deal creation', b: 'Equity, T-bills, bonds, private placements — AI-assisted structuring' },
            { icon: FileText, t: 'Deal room', b: 'Real-time negotiation, documents, e-signatures, AI term sheet generation' },
            { icon: DollarSign, t: 'Escrow engine', b: 'Lock funds, define conditions, auto-release on confirmation' },
            { icon: Shield, t: 'KYC verified', b: 'SEC licences, CAC, NIN/BVN — every participant verified' },
          ].map(({ icon: Icon, t, b }) => (
            <div key={t} className="bg-[#1a1d24] border border-[#2a2d35] rounded-xl p-5">
              <Icon size={20} className="text-[#1D9E75] mb-3" />
              <h3 className="font-semibold text-white mb-2">{t}</h3>
              <p className="text-sm text-[#888] leading-relaxed">{b}</p>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {[
            { type: 'Stockbroker / Dealer', desc: 'Create deals, invite counterparties, earn commission. Requires SEC licence.', docs: ['SEC dealing licence', 'NGX membership', 'CSCS participant code'] },
            { type: 'Fund Manager', desc: 'Lead and participate in deals, deploy capital. Requires SEC fund manager licence.', docs: ['SEC fund manager licence', 'CAC registration', 'Directors\' IDs'] },
            { type: 'Corporate / Institutional', desc: 'Participate in private placements and structured deals.', docs: ['CAC certificate', 'Board resolution', 'TIN'] },
          ].map(p => (
            <div key={p.type} className="bg-[#1a1d24] border border-[#2a2d35] rounded-xl p-5">
              <p className="font-semibold text-white mb-2">{p.type}</p>
              <p className="text-sm text-[#888] mb-4">{p.desc}</p>
              <p className="text-xs text-[#555] mb-2">Required documents:</p>
              <ul className="space-y-1 mb-4">{p.docs.map(d => <li key={d} className="text-xs text-[#888] flex items-center gap-1.5"><span className="text-[#1D9E75]">✓</span>{d}</li>)}</ul>
              <Link to="/register" className="btn-teal text-xs w-full">Register →</Link>
            </div>
          ))}
        </div>
      </div>

      <footer className="border-t border-[#2a2d35] px-6 py-8 text-center text-xs text-[#555]">
        <p>Aprisys — Powered by Cellion One Ltd · Lagos, Nigeria</p>
        <p className="mt-1">All market content is for informational purposes only. Not investment advice. · NDPR & SEC compliant</p>
      </footer>
    </div>
  );
}
