import { Link } from 'react-router-dom';
import { TrendingUp, CheckCircle, Zap, Star, Bell } from 'lucide-react';

export default function RetailLanding() {
  return (
    <div className="min-h-screen bg-[#f5f4f0]">
      <nav className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#e5e4e0]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#1a1a1a] rounded-md flex items-center justify-center"><TrendingUp size={14} color="white" /></div>
          <span className="font-semibold text-sm">Aprisys</span>
          <span className="text-xs text-[#aaa]">powered by Cellion One</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm text-[#555] hover:text-[#1a1a1a]">Sign in</Link>
          <Link to="/register" className="btn-primary text-xs">Start free</Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <p className="text-xs font-medium text-[#1D9E75] uppercase tracking-widest mb-4">Nigerian Equity Intelligence</p>
        <h1 className="text-4xl md:text-5xl font-bold text-[#1a1a1a] mb-5 leading-tight">
          Daily market intelligence,<br/>personalised to your portfolio
        </h1>
        <p className="text-lg text-[#555] mb-8 max-w-xl mx-auto">
          AI-powered daily digests of the Nigerian stock market — IAS scores, signals, sector rotation, and your watchlist, delivered every evening.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link to="/register" className="btn-primary px-8 py-3 text-base">Start free — no card needed</Link>
          <Link to="/login" className="btn-secondary px-6 py-3 text-base">Sign in</Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 pb-16">
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {[
            { icon: Star, t: 'Watchlist tracking', b: 'Add any NGX ticker. Your digest prioritises your watched securities first every session.' },
            { icon: Zap, t: 'AI market commentary', b: 'Daily AI-generated analysis of market direction, key movers, and sector rotation.' },
            { icon: Bell, t: 'Signal alerts', b: 'Trade calls, rumours, dividends — filtered to the signal types you care about.' },
          ].map(({ icon: Icon, t, b }) => (
            <div key={t} className="card">
              <Icon size={20} className="text-[#1D9E75] mb-3" />
              <h3 className="font-semibold mb-2">{t}</h3>
              <p className="text-sm text-[#555] leading-relaxed">{b}</p>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {[
            { name: 'Free', price: '₦0', period: 'forever', features: ['Weekly market summary', 'Top 5 securities', '5 watchlist tickers'] },
            { name: 'Standard', price: '₦2,500', period: '/month', features: ['Daily digest email', 'Full securities list', 'AI commentary', 'Active signals', 'Dividend alerts'], highlight: true },
            { name: 'Pro', price: '₦7,500', period: '/month', features: ['Everything in Standard', 'SMS signal alerts', 'Real-time notifications', 'Custom SMS hours'] },
          ].map((p: any) => (
            <div key={p.name} className={`card ${p.highlight ? 'ring-2 ring-[#1a1a1a]' : ''}`}>
              {p.highlight && <div className="text-xs font-medium text-center bg-[#1a1a1a] text-white rounded-full px-3 py-1 mb-3 -mt-2 -mx-2">Most popular</div>}
              <p className="font-semibold mb-1">{p.name}</p>
              <p className="text-2xl font-bold mb-0.5">{p.price}</p>
              <p className="text-xs text-[#aaa] mb-4">{p.period}</p>
              <ul className="space-y-2 mb-5">
                {p.features.map((f: string) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle size={13} className="text-green-500 shrink-0" />{f}
                  </li>
                ))}
              </ul>
              <Link to="/register" className={`${p.highlight ? 'btn-primary' : 'btn-secondary'} w-full text-sm`}>Get started</Link>
            </div>
          ))}
        </div>
      </div>

      <footer className="border-t border-[#e5e4e0] px-6 py-8 text-center text-xs text-[#aaa]">
        <p>Aprisys — Powered by Cellion One Ltd · Lagos, Nigeria</p>
        <p className="mt-1">All content is for informational purposes only and does not constitute investment advice. · NDPR compliant</p>
        <p className="mt-2"><Link to="/deals-landing" className="underline text-[#888]">Professional & institutional access →</Link></p>
      </footer>
    </div>
  );
}
