// WATCHLIST
import { useState, useEffect } from 'react';
import { apiFetch, useAuth } from '../../contexts/AuthContext';
import { Plus, X, Search, TrendingUp, TrendingDown, Star } from 'lucide-react';

interface WatchItem { ticker: string; company_name: string; ias: number; close: number; change_pct: number; }
interface SearchResult { ticker: string; name: string; }

export function WatchlistPage() {
  const { subscriber } = useAuth();
  const [items, setItems] = useState<WatchItem[]>([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const plan = subscriber?.plan ?? 'free';

  async function load() { setLoading(true); try { setItems(await apiFetch('/watchlist')); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => { try { setResults(await apiFetch(`/watchlist/search?q=${encodeURIComponent(search)}`)); } catch {} }, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function add(ticker: string) {
    try { await apiFetch('/watchlist', { method: 'POST', body: JSON.stringify({ ticker }) }); setSearch(''); setResults([]); await load(); } catch (err) { alert((err as Error).message); }
  }
  async function remove(ticker: string) { await apiFetch(`/watchlist/${ticker}`, { method: 'DELETE' }); setItems(p => p.filter(i => i.ticker !== ticker)); }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6"><h1 className="text-2xl font-semibold">Watchlist</h1><p className="text-sm text-[#888] mt-1">{plan === 'free' ? `${items.length}/5 tickers (Free plan)` : `${items.length} tickers`}</p></div>
      <div className="card mb-6">
        <p className="text-sm font-medium mb-3">Add a security</p>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#aaa]" />
          <input className="input pl-9" placeholder="Search NGX tickers…" value={search} onChange={e => setSearch(e.target.value)} disabled={items.length >= 5 && plan === 'free'} />
        </div>
        {plan === 'free' && items.length >= 5 && <p className="text-xs text-amber-600 mt-2">Free plan limited to 5 tickers. <a href="/retail/billing" className="underline">Upgrade</a> for unlimited.</p>}
        {results.length > 0 && (
          <div className="mt-2 border border-[#e5e4e0] rounded-lg overflow-hidden divide-y divide-[#f0efeb]">
            {results.map(r => (
              <div key={r.ticker} className="flex items-center justify-between px-4 py-2.5 hover:bg-[#f8f7f4]">
                <div><p className="text-sm font-medium">{r.ticker}</p><p className="text-xs text-[#aaa]">{r.name}</p></div>
                <button onClick={() => add(r.ticker)} disabled={items.some(i => i.ticker === r.ticker)} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
                  {items.some(i => i.ticker === r.ticker) ? 'Added' : <><Plus size={13} />Add</>}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {loading ? <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="card h-16 animate-pulse bg-[#f0efeb]" />)}</div>
        : items.length === 0 ? <div className="card text-center py-12"><Star size={24} className="text-[#ddd] mx-auto mb-3" /><p className="text-sm text-[#888]">Your watchlist is empty</p></div>
        : <div className="card divide-y divide-[#f0efeb]">
            {items.map(item => {
              const up = (item.change_pct ?? 0) >= 0;
              return (
                <div key={item.ticker} className="flex items-center gap-4 py-3.5">
                  <div className="flex-1 min-w-0"><p className="text-sm font-semibold">{item.ticker}</p><p className="text-xs text-[#aaa] truncate">{item.company_name}</p></div>
                  <div className="text-right hidden sm:block"><p className="text-xs text-[#aaa]">IAS</p><p className="text-sm font-semibold">{item.ias?.toFixed(1) ?? '—'}</p></div>
                  <div className="text-right"><p className="text-sm">₦{item.close?.toFixed(2) ?? '—'}</p><p className={`text-xs flex items-center justify-end gap-0.5 ${up ? 'text-green-600' : 'text-red-600'}`}>{up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{up ? '+' : ''}{(item.change_pct ?? 0).toFixed(2)}%</p></div>
                  <button onClick={() => remove(item.ticker)} className="p-1.5 text-[#ccc] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><X size={15} /></button>
                </div>
              );
            })}
          </div>
      }
    </div>
  );
}

// DIGEST PAGE
export function DigestPage() {
  const { subscriber } = useAuth();
  const [digest, setDigest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const plan = subscriber?.plan ?? 'free';

  useEffect(() => { apiFetch<any>('/digest/today').then(setDigest).catch(() => {}).finally(() => setLoading(false)); }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-5 h-5 border-2 border-[#1a1a1a] border-t-transparent rounded-full animate-spin" /></div>;
  if (!digest?.market_snapshot) return <div className="max-w-3xl mx-auto"><div className="card text-center py-12"><p className="text-[#888] text-sm">Today's digest hasn't been composed yet. Check back after 7:30pm WAT.</p></div></div>;

  const ms = digest.market_snapshot;
  const up = (ms?.asi_change_pct ?? 0) >= 0;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="text-2xl font-semibold">Today's digest</h1>
      <div className="card">
        <p className="label mb-3">Market snapshot</p>
        <p className="text-2xl font-bold">{(ms.asi ?? 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })}</p>
        <p className={`text-sm mt-1 ${up ? 'text-green-600' : 'text-red-600'}`}>{up ? '▲' : '▼'} {Math.abs(ms.asi_change_pct ?? 0).toFixed(2)}%</p>
        <p className="text-xs text-[#888] mt-2">Advancing: {ms.advancing} · Declining: {ms.declining} · Turnover: ₦{((ms.turnover ?? 0)/1e9).toFixed(2)}B</p>
      </div>
      {plan !== 'free' && digest.ai_commentary && (
        <div className="card"><p className="label mb-3">AI commentary</p><p className="text-sm text-[#333] leading-7">{digest.ai_commentary}</p><p className="text-xs text-[#bbb] mt-3 italic">Not investment advice</p></div>
      )}
      <div className="card">
        <p className="label mb-4">Top securities by IAS {plan === 'free' && '(top 5 — upgrade for full list)'}</p>
        <div className="divide-y divide-[#f8f7f4]">
          {(digest.top_securities ?? []).map((s: any, i: number) => (
            <div key={s.ticker} className="flex items-center py-2.5 gap-3">
              <span className="text-xs text-[#ccc] w-5">{i + 1}</span>
              <div className="flex-1 min-w-0"><p className="text-sm font-medium">{s.ticker}</p><p className="text-xs text-[#aaa] truncate">{s.name}</p></div>
              <div className="text-right"><p className="text-sm font-semibold">{s.ias?.toFixed(1)}</p><p className="text-xs text-[#aaa]">IAS</p></div>
              <div className="text-right w-20"><p className="text-sm">₦{s.close?.toFixed(2)}</p><p className={`text-xs ${(s.change_pct ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{(s.change_pct ?? 0) >= 0 ? '+' : ''}{(s.change_pct ?? 0).toFixed(2)}%</p></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ARCHIVE PAGE
export function ArchivePage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<any>(`/digest/archive?page=${page}`).then(res => { setEntries(res.data); setTotal(res.pagination.total); }).catch(() => {}).finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6"><h1 className="text-2xl font-semibold">Digest archive</h1></div>
      {loading ? <div className="card h-64 animate-pulse bg-[#f0efeb]" /> : entries.length === 0 ? <div className="card text-center py-12"><p className="text-sm text-[#888]">No archived digests yet</p></div> : (
        <div className="card divide-y divide-[#f8f7f4]">
          {entries.map((e: any) => (
            <div key={e.digest_date} className="flex items-center py-3.5 gap-4">
              <div className="flex-1"><p className="text-sm font-medium">{new Date(e.digest_date).toLocaleDateString('en-NG', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}</p></div>
              <p className={`text-sm ${(e.asi_change_pct ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{(e.asi_change_pct ?? 0) >= 0 ? '▲' : '▼'} {Math.abs(e.asi_change_pct ?? 0).toFixed(2)}%</p>
            </div>
          ))}
        </div>
      )}
      {total > 20 && <div className="flex justify-between mt-4"><button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary text-xs disabled:opacity-50">← Newer</button><button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 20)} className="btn-secondary text-xs disabled:opacity-50">Older →</button></div>}
    </div>
  );
}

// SETTINGS PAGE
export function SettingsPage() {
  const { subscriber, refresh } = useAuth();
  const [prefs, setPrefs] = useState<any>(null);
  const [profile, setProfile] = useState({ name: subscriber?.name ?? '', phone: subscriber?.phone ?? '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const plan = subscriber?.plan ?? 'free';

  useEffect(() => { apiFetch<any>('/preferences').then(setPrefs); }, []);

  async function savePrefs() {
    setSaving(true);
    try { await apiFetch('/preferences', { method: 'PUT', body: JSON.stringify(prefs) }); setSaved(true); setTimeout(() => setSaved(false), 2000); } finally { setSaving(false); }
  }

  async function saveProfile(e: any) {
    e.preventDefault(); setSaving(true);
    try { await apiFetch('/preferences/profile', { method: 'PUT', body: JSON.stringify(profile) }); await refresh(); setSaved(true); setTimeout(() => setSaved(false), 2000); } finally { setSaving(false); }
  }

  async function deleteAccount() {
    if (prompt('Type DELETE to permanently delete your account:') !== 'DELETE') return;
    await apiFetch('/preferences/delete-account', { method: 'POST' });
    window.location.href = '/';
  }

  if (!prefs) return <div className="flex items-center justify-center py-20"><div className="w-5 h-5 border-2 border-[#1a1a1a] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div><h1 className="text-2xl font-semibold">Settings</h1></div>
      <div className="card">
        <p className="label mb-4">Profile</p>
        <form onSubmit={saveProfile} className="space-y-4">
          <div><label className="label">Full name</label><input className="input" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} /></div>
          <div><label className="label">Email</label><input className="input" value={subscriber?.email} disabled /></div>
          <div><label className="label">Phone</label><input className="input" value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} placeholder="+2348012345678" /></div>
          <button type="submit" className="btn-primary" disabled={saving}>{saved ? 'Saved!' : saving ? 'Saving…' : 'Save profile'}</button>
        </form>
      </div>
      <div className="card">
        <p className="label mb-4">Delivery preferences</p>
        <div className="space-y-4">
          <div><label className="label">Frequency</label>
            <select className="input" value={prefs.frequency} onChange={e => setPrefs((p: any) => ({ ...p, frequency: e.target.value }))}>
              <option value="daily">Daily</option><option value="weekdays">Weekdays only</option><option value="weekly">Weekly only</option>
            </select>
          </div>
          <div><label className="label">Delivery time (WAT)</label>
            <select className="input" value={prefs.delivery_time} onChange={e => setPrefs((p: any) => ({ ...p, delivery_time: e.target.value }))}>
              <option value="07:30">7:30 AM</option><option value="12:00">12:00 PM</option><option value="19:30">7:30 PM</option>
            </select>
          </div>
          <button onClick={savePrefs} className="btn-primary" disabled={saving}>{saved ? 'Saved!' : 'Save preferences'}</button>
        </div>
      </div>
      <div className="card border-red-200">
        <p className="text-xs font-medium text-red-600 uppercase tracking-wider mb-3">Danger zone</p>
        <p className="text-sm text-[#555] mb-4">Permanently delete your account and all data (NDPR erasure).</p>
        <button onClick={deleteAccount} className="text-sm text-red-600 border border-red-200 px-3 py-2 rounded-lg hover:border-red-300 transition-colors">Delete my account</button>
      </div>
    </div>
  );
}

export default WatchlistPage;
