// ─── RETAIL DASHBOARD ────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, apiFetch } from '../../contexts/AuthContext';
import { TrendingUp, TrendingDown, Zap, Star, ArrowRight, Lock } from 'lucide-react';

interface DigestData {
  market_snapshot: Record<string, number>;
  ai_commentary: string;
  top_securities: Array<{ ticker: string; name: string; ias: number; close: number; change_pct: number }>;
  signals: Array<{ id: string; ticker: string; headline: string; priority: string }>;
}

export function RetailDashboard() {
  const { subscriber, accessToken } = useAuth();
  const [digest, setDigest] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);
  const plan = subscriber?.plan ?? 'free';

  useEffect(() => {
    apiFetch<DigestData>('/digest/today').then(setDigest).catch(() => {}).finally(() => setLoading(false));
  }, [accessToken]);

  const ms = digest?.market_snapshot;
  const up = (ms?.asi_change_pct ?? 0) >= 0;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Good morning, {subscriber?.name?.split(' ')[0]}</h1>
        <p className="text-sm text-[#888] mt-1">{new Date().toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {plan === 'free' && (
        <div className="mb-6 p-4 bg-[#1a1a1a] rounded-xl text-white flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Upgrade to Standard — ₦2,500/month</p>
            <p className="text-xs text-[#aaa] mt-0.5">Daily digest, full securities list, AI commentary, signals</p>
          </div>
          <Link to="/retail/billing" className="shrink-0 text-xs bg-white text-[#1a1a1a] px-3 py-1.5 rounded-lg font-medium hover:bg-[#f0efeb]">Upgrade</Link>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-[#f0efeb]" />)}
        </div>
      ) : ms ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="card">
              <p className="label">All-Share Index</p>
              <p className="text-xl font-semibold">{(ms.asi ?? 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })}</p>
              <p className={`text-xs mt-1 flex items-center gap-1 ${up ? 'text-green-600' : 'text-red-600'}`}>
                {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {up ? '+' : ''}{(ms.asi_change_pct ?? 0).toFixed(2)}%
              </p>
            </div>
            <div className="card">
              <p className="label">Advancing</p>
              <p className="text-xl font-semibold text-green-600">{ms.advancing ?? 0}</p>
              <p className="text-xs text-[#aaa] mt-1">{ms.declining ?? 0} declining</p>
            </div>
            <div className="card">
              <p className="label">Turnover</p>
              <p className="text-xl font-semibold">₦{((ms.turnover ?? 0) / 1e9).toFixed(2)}B</p>
              <p className="text-xs text-[#aaa] mt-1">{((ms.volume ?? 0) / 1e6).toFixed(1)}M units</p>
            </div>
            <div className="card">
              <p className="label">Market deals</p>
              <p className="text-xl font-semibold">{(ms.deals ?? 0).toLocaleString()}</p>
              <p className="text-xs text-[#aaa] mt-1">transactions</p>
            </div>
          </div>

          {plan !== 'free' && digest?.ai_commentary ? (
            <div className="card mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={14} className="text-amber-500" />
                <p className="label" style={{ marginBottom: 0 }}>AI commentary</p>
              </div>
              <p className="text-sm text-[#333] leading-7">{digest.ai_commentary.slice(0, 400)}{digest.ai_commentary.length > 400 ? '…' : ''}</p>
              <Link to="/retail/digest" className="mt-3 inline-flex items-center gap-1 text-xs text-[#888] hover:text-[#1a1a1a]">Read full digest <ArrowRight size={12} /></Link>
            </div>
          ) : plan === 'free' ? (
            <div className="card mb-6 flex items-center gap-4">
              <Lock size={18} className="text-[#ccc] shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">AI commentary available on Standard</p>
                <p className="text-xs text-[#888] mt-0.5">Upgrade to read daily AI market analysis</p>
              </div>
              <Link to="/retail/billing" className="btn-primary text-xs">Upgrade</Link>
            </div>
          ) : null}

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Star size={14} className="text-amber-500" />
                <p className="label" style={{ marginBottom: 0 }}>{plan === 'free' ? 'Top 5 securities' : 'Top securities by IAS'}</p>
              </div>
              <Link to="/retail/digest" className="text-xs text-[#888] hover:text-[#1a1a1a] flex items-center gap-1">View all <ArrowRight size={12} /></Link>
            </div>
            <div className="divide-y divide-[#f0efeb]">
              {(digest?.top_securities ?? []).slice(0, plan === 'free' ? 5 : 10).map((s, i) => (
                <div key={s.ticker} className="flex items-center py-2.5 gap-3">
                  <span className="text-xs text-[#ccc] w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{s.ticker}</p>
                    <p className="text-xs text-[#aaa] truncate">{s.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{s.ias?.toFixed(1)}</p>
                    <p className="text-xs text-[#aaa]">IAS</p>
                  </div>
                  <div className="text-right w-20">
                    <p className="text-sm">₦{s.close?.toFixed(2)}</p>
                    <p className={`text-xs ${(s.change_pct ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {(s.change_pct ?? 0) >= 0 ? '+' : ''}{(s.change_pct ?? 0).toFixed(2)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="card text-center py-12">
          <p className="text-[#888] text-sm">Today's digest hasn't been composed yet.</p>
          <p className="text-[#aaa] text-xs mt-1">Check back after 7:30pm WAT.</p>
        </div>
      )}
    </div>
  );
}

export default RetailDashboard;
