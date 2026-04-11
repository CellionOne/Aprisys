// ─── BILLING PAGE ─────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import { useAuth, apiFetch } from '../../contexts/AuthContext';
import { CheckCircle, Zap, AlertTriangle } from 'lucide-react';

const PLANS = [
  { key: 'free', name: 'Free', price: '₦0', period: 'forever', features: ['Weekly market summary', 'Top 5 securities', '5 watchlist tickers'], cta: 'Current plan', highlight: false },
  { key: 'standard', name: 'Standard', price: '₦2,500', period: '/month', features: ['Daily digest email', 'Full securities list', 'AI market commentary', 'Active signals', 'Dividend alerts', 'Unlimited watchlist', 'Digest archive'], cta: 'Upgrade to Standard', highlight: true },
  { key: 'pro', name: 'Pro', price: '₦7,500', period: '/month', features: ['Everything in Standard', 'SMS signal alerts', 'Sector rotation alerts', 'Real-time signals', 'Custom SMS hours'], cta: 'Upgrade to Pro', highlight: false },
];

export function BillingPage() {
  const { subscriber, refresh } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Record<string, unknown> | null>(null);
  const plan = subscriber?.plan ?? 'free';

  useEffect(() => {
    apiFetch<Record<string, unknown>>('/subscriptions/me').then(setSubscription).catch(() => {});
    const params = new URLSearchParams(window.location.search);
    if (params.get('session') === 'success') { refresh(); window.history.replaceState({}, '', '/retail/billing'); }
  }, []);

  async function handleUpgrade(targetPlan: string) {
    if (targetPlan === 'free' || targetPlan === plan) return;
    setCheckoutLoading(targetPlan);
    try {
      const res = await apiFetch<{ authorization_url: string }>('/subscriptions/checkout', { method: 'POST', body: JSON.stringify({ plan: targetPlan }) });
      window.location.href = res.authorization_url;
    } catch (err) { alert((err as Error).message); }
    finally { setCheckoutLoading(null); }
  }

  async function handleCancel() {
    if (!confirm('Cancel your subscription? Access is retained until the end of your current period.')) return;
    try { await apiFetch('/subscriptions/cancel', { method: 'POST' }); await refresh(); alert('Subscription cancelled.'); } catch (err) { alert((err as Error).message); }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6"><h1 className="text-2xl font-semibold">Billing</h1><p className="text-sm text-[#888] mt-1">Manage your subscription</p></div>

      {subscription && plan !== 'free' && (
        <div className="card mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium flex items-center gap-2"><CheckCircle size={15} className="text-green-500" />{plan} plan — active</p>
            {subscription.current_period_end && <p className="text-xs text-[#888] mt-1">Renews {new Date(subscription.current_period_end as string).toLocaleDateString('en-NG')}</p>}
            {subscription.status === 'grace' && <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle size={12} />Grace period — payment failed</p>}
          </div>
          <button onClick={handleCancel} className="btn-secondary text-xs">Cancel plan</button>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {PLANS.map(p => {
          const isCurrent = p.key === plan;
          const isLower = ['free'].includes(p.key) && plan !== 'free';
          return (
            <div key={p.key} className={`card relative ${p.highlight ? 'ring-2 ring-[#1a1a1a]' : ''}`}>
              {p.highlight && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1a1a1a] text-white text-xs px-3 py-1 rounded-full">Most popular</div>}
              <p className="label">{p.name}</p>
              <p className="text-2xl font-bold mb-0.5">{p.price}</p>
              <p className="text-xs text-[#aaa] mb-5">{p.period}</p>
              <ul className="space-y-2 mb-5">
                {p.features.map(f => <li key={f} className="flex items-start gap-2 text-sm"><CheckCircle size={13} className="text-green-500 mt-0.5 shrink-0" /><span className="text-[#555]">{f}</span></li>)}
              </ul>
              {isCurrent ? <div className="w-full text-center text-xs text-[#888] py-2 border border-[#e5e4e0] rounded-lg">Current plan</div>
                : isLower ? <div className="w-full text-center text-xs text-[#bbb] py-2">—</div>
                : <button onClick={() => handleUpgrade(p.key)} disabled={!!checkoutLoading} className={`${p.highlight ? 'btn-primary' : 'btn-secondary'} w-full`}>
                    {checkoutLoading === p.key ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Zap size={14} />}
                    {checkoutLoading === p.key ? 'Redirecting…' : p.cta}
                  </button>
              }
            </div>
          );
        })}
      </div>
      <p className="text-xs text-[#aaa] text-center">Payments processed by Paystack. All prices in Nigerian Naira (₦).</p>
    </div>
  );
}

export default BillingPage;
