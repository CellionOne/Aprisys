import { useState, useEffect } from 'react';
import { apiFetch } from '../../contexts/AuthContext';
import { Users, Briefcase, DollarSign, FileText, Activity, ShieldCheck, RefreshCw, CheckCircle, X } from 'lucide-react';

// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  useEffect(() => { apiFetch<any>('/admin/stats').then(setStats).catch(() => {}); }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-6">Admin overview</h1>
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total subscribers', value: parseInt(stats.subscribers?.retail ?? 0) + parseInt(stats.subscribers?.qualified ?? 0) + parseInt(stats.subscribers?.professional ?? 0), icon: Users },
            { label: 'Active deals', value: stats.deals?.active ?? 0, icon: Briefcase },
            { label: 'Escrow locked', value: `₦${((stats.escrow?.locked ?? 0) / 1e6).toFixed(1)}M`, icon: DollarSign },
            { label: 'KYC queue', value: stats.subscribers?.kyc_queue ?? 0, icon: ShieldCheck },
          ].map(s => (
            <div key={s.label} className="deals-card">
              <s.icon size={16} className="text-[#1D9E75] mb-2" />
              <p className="text-xs text-[#555] mb-1">{s.label}</p>
              <p className="text-xl font-semibold text-white">{s.value}</p>
            </div>
          ))}
        </div>
      )}
      <div className="grid md:grid-cols-3 gap-4">
        {[
          { label: 'Subscribers', href: '/admin/subscribers', icon: Users, desc: 'Manage all users, suspend, delete' },
          { label: 'KYC reviews', href: '/admin/kyc', icon: ShieldCheck, desc: 'Review and approve pending KYC' },
          { label: 'Active escrow', href: '/admin/escrow', icon: DollarSign, desc: 'Release, refund, dispute resolution' },
          { label: 'All deals', href: '/admin/deals', icon: Briefcase, desc: 'Monitor all platform deals' },
          { label: 'Digest', href: '/admin/digest', icon: FileText, desc: 'Preview, trigger, delivery stats' },
          { label: 'Audit log', href: '/admin/audit', icon: Activity, desc: 'Full immutable event trail' },
        ].map(s => (
          <a key={s.label} href={s.href} className="deals-card hover:border-[#1D9E75]/50 transition-colors block">
            <s.icon size={16} className="text-[#1D9E75] mb-2" />
            <p className="text-sm font-medium text-white mb-1">{s.label}</p>
            <p className="text-xs text-[#555]">{s.desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── ADMIN SUBSCRIBERS ───────────────────────────────────────────────────────
export function AdminSubscribers() {
  const [subs, setSubs] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setSubs(await apiFetch(`/admin/subscribers${filter ? `?account_type=${filter}` : ''}`)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [filter]);

  async function suspend(id: string, name: string) {
    const reason = prompt(`Reason for suspending ${name}:`); if (!reason) return;
    await apiFetch(`/admin/subscribers/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) });
    load();
  }

  async function reinstate(id: string) {
    await apiFetch(`/admin/subscribers/${id}/reinstate`, { method: 'POST' }); load();
  }

  async function del(id: string, email: string) {
    if (!confirm(`Permanently delete ${email}? This is an NDPR erasure and cannot be undone.`)) return;
    await apiFetch(`/admin/subscribers/${id}`, { method: 'DELETE' }); load();
  }

  const STATUS_COLOR: Record<string, string> = { active: 'badge-teal', suspended: 'badge-red', deleted: 'badge-gray' };
  const KYC_COLOR: Record<string, string> = { verified: 'badge-green', pending: 'badge-gray', submitted: 'badge-blue', rejected: 'badge-red' };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-white">Subscribers</h1>
        <div className="flex gap-3">
          <select className="deals-input text-sm py-1.5 w-44" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">All types</option>
            {['retail', 'qualified', 'broker', 'fund_manager', 'corporate', 'institutional'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={load} className="btn-secondary text-xs"><RefreshCw size={13} /></button>
        </div>
      </div>
      {loading ? <div className="deals-card h-64 animate-pulse" /> : (
        <div className="deals-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#2a2d35]">{['Name', 'Account type', 'KYC', 'Status', 'Plan', 'Deals', 'Joined', ''].map(h => <th key={h} className="text-left pb-3 text-xs text-[#555] font-normal pr-4">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#1a1d24]">
              {subs.map((s: any) => (
                <tr key={s.id}>
                  <td className="py-3 pr-4"><p className="text-white font-medium">{s.name}</p><p className="text-xs text-[#555]">{s.email}</p></td>
                  <td className="py-3 pr-4 text-[#888] capitalize text-xs">{s.account_type}</td>
                  <td className="py-3 pr-4"><span className={KYC_COLOR[s.kyc_status] ?? 'badge-gray'}>{s.kyc_status}</span></td>
                  <td className="py-3 pr-4"><span className={STATUS_COLOR[s.account_status] ?? 'badge-gray'}>{s.account_status}</span></td>
                  <td className="py-3 pr-4 text-[#888]">{s.plan}</td>
                  <td className="py-3 pr-4 text-[#888]">{s.deal_count}</td>
                  <td className="py-3 pr-4 text-xs text-[#555]">{new Date(s.created_at).toLocaleDateString('en-NG')}</td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      {s.account_status === 'active' ? <button onClick={() => suspend(s.id, s.name)} className="text-xs text-amber-400 hover:underline">Suspend</button> : <button onClick={() => reinstate(s.id)} className="text-xs text-green-400 hover:underline">Reinstate</button>}
                      <button onClick={() => del(s.id, s.email)} className="text-xs text-red-400 hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── ADMIN KYC ───────────────────────────────────────────────────────────────
export function AdminKYC() {
  const [records, setRecords] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [decision, setDecision] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() { setRecords(await apiFetch('/admin/kyc/pending')); }
  useEffect(() => { load(); }, []);

  async function review() {
    if (!selected || !decision) return;
    setSaving(true);
    try {
      await apiFetch(`/admin/kyc/${selected.id}/review`, { method: 'PUT', body: JSON.stringify({ decision, notes, rejection_reason: reason }) });
      setSelected(null); setDecision(''); setNotes(''); setReason('');
      await load();
    } finally { setSaving(false); }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-6">KYC reviews ({records.length} pending)</h1>
      <div className="grid md:grid-cols-2 gap-5">
        <div className="space-y-3">
          {records.length === 0 ? <div className="deals-card text-center py-8"><p className="text-[#555] text-sm">No pending KYC reviews</p></div> : records.map((r: any) => (
            <button key={r.id} onClick={() => setSelected(r)} className={`deals-card w-full text-left hover:border-[#1D9E75]/50 transition-colors ${selected?.id === r.id ? 'border-[#1D9E75]' : ''}`}>
              <p className="text-sm font-medium text-white">{r.name}</p>
              <p className="text-xs text-[#555]">{r.email} · {r.entity_type}</p>
              <p className="text-xs text-[#888] mt-1">Submitted {new Date(r.submitted_at).toLocaleDateString('en-NG')}</p>
            </button>
          ))}
        </div>
        {selected && (
          <div className="deals-card space-y-4">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold text-white">{selected.name}</p><button onClick={() => setSelected(null)}><X size={15} className="text-[#555]" /></button></div>
            <div className="text-xs text-[#888] space-y-1">
              {['nin', 'bvn', 'sec_licence', 'ngx_membership', 'cscs_code', 'cac_number', 'tin'].map(f => selected[f] && <p key={f}><span className="text-[#555] uppercase">{f.replace(/_/g, ' ')}: </span>{selected[f]}</p>)}
            </div>
            <div>
              <p className="text-xs text-[#555] mb-2">Documents ({selected.documents?.length ?? 0})</p>
              {(selected.documents ?? []).map((d: any, i: number) => <p key={i} className="text-xs text-[#1D9E75]">✓ {d.filename}</p>)}
            </div>
            <div>
              <label className="label text-[#555]">Decision</label>
              <select className="deals-input" value={decision} onChange={e => setDecision(e.target.value)}>
                <option value="">Select decision</option>
                <option value="verified">Approve — verified</option>
                <option value="rejected">Reject</option>
              </select>
            </div>
            {decision === 'rejected' && <div><label className="label text-[#555]">Rejection reason (shown to user)</label><textarea className="deals-input w-full h-20 resize-none text-sm" value={reason} onChange={e => setReason(e.target.value)} required /></div>}
            <div><label className="label text-[#555]">Internal notes</label><textarea className="deals-input w-full h-16 resize-none text-sm" value={notes} onChange={e => setNotes(e.target.value)} /></div>
            <button onClick={review} disabled={!decision || saving || (decision === 'rejected' && !reason)} className={`w-full text-sm py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${decision === 'verified' ? 'bg-[#1D9E75] text-white' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
              {saving ? 'Saving…' : decision === 'verified' ? '✓ Approve KYC' : '✗ Reject KYC'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ADMIN ESCROW ─────────────────────────────────────────────────────────────
export function AdminEscrow() {
  const [escrows, setEscrows] = useState<any[]>([]);
  useEffect(() => { apiFetch<any[]>('/admin/escrow/active').then(setEscrows).catch(() => {}); }, []);

  async function action(id: string, type: 'release' | 'refund') {
    const reason = prompt(`Reason for ${type}:`); if (!reason) return;
    await apiFetch(`/admin/escrow/${id}/${type}`, { method: 'POST', body: JSON.stringify({ reason }) });
    setEscrows(e => e.filter(x => x.id !== id));
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-6">Active escrow ({escrows.length})</h1>
      {escrows.length === 0 ? <div className="deals-card text-center py-12"><p className="text-[#555]">No active escrow transactions</p></div> : (
        <div className="deals-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#2a2d35]">{['Deal', 'Amount', 'Status', 'Funded', 'Expiry', 'Actions'].map(h => <th key={h} className="text-left pb-3 text-xs text-[#555] font-normal pr-4">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#1a1d24]">
              {escrows.map((e: any) => (
                <tr key={e.id}>
                  <td className="py-3 pr-4"><p className="text-white font-mono text-xs">{e.reference}</p><p className="text-xs text-[#555]">{e.title}</p></td>
                  <td className="py-3 pr-4 text-white font-medium">₦{(e.amount / 1e6).toFixed(2)}M</td>
                  <td className="py-3 pr-4"><span className={e.status === 'disputed' ? 'badge-red' : 'badge-amber'}>{e.status}</span></td>
                  <td className="py-3 pr-4 text-xs text-[#888]">{e.funded_at ? new Date(e.funded_at).toLocaleDateString('en-NG') : '—'}</td>
                  <td className="py-3 pr-4 text-xs text-[#888]">{e.expiry_at ? new Date(e.expiry_at).toLocaleDateString('en-NG') : '—'}</td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button onClick={() => action(e.id, 'release')} className="text-xs text-green-400 hover:underline">Release</button>
                      <button onClick={() => action(e.id, 'refund')} className="text-xs text-red-400 hover:underline">Refund</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── ADMIN DEALS ──────────────────────────────────────────────────────────────
export function AdminDeals() {
  const [deals, setDeals] = useState<any[]>([]);
  useEffect(() => { apiFetch<any[]>('/admin/deals').then(setDeals).catch(() => {}); }, []);
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-6">All deals</h1>
      <div className="deals-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[#2a2d35]">{['Reference', 'Title', 'Creator', 'Type', 'Value', 'Status'].map(h => <th key={h} className="text-left pb-3 text-xs text-[#555] font-normal pr-4">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-[#1a1d24]">
            {deals.map((d: any) => <tr key={d.id}><td className="py-3 pr-4 font-mono text-xs text-[#888]">{d.reference}</td><td className="py-3 pr-4 text-white">{d.title}</td><td className="py-3 pr-4 text-xs text-[#888]">{d.creator_name}</td><td className="py-3 pr-4 text-xs text-[#888] capitalize">{d.deal_type}</td><td className="py-3 pr-4 text-white">₦{((d.total_value ?? 0)/1e6).toFixed(2)}M</td><td className="py-3"><span className={d.status === 'completed' ? 'badge-green' : d.status === 'open' ? 'badge-blue' : 'badge-gray'}>{d.status}</span></td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ADMIN DIGEST ─────────────────────────────────────────────────────────────
export function AdminDigest() {
  const [triggering, setTriggering] = useState(false);
  const [msg, setMsg] = useState('');
  const today = new Date().toISOString().split('T')[0];

  async function trigger() {
    setTriggering(true);
    try { const r = await apiFetch<{ message: string }>('/admin/digest/trigger', { method: 'POST', body: JSON.stringify({}) }); setMsg(r.message); }
    finally { setTriggering(false); }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-6">Digest management</h1>
      {msg && <div className="deals-card mb-4 border-[#1D9E75]/30"><p className="text-sm text-[#1D9E75]">{msg}</p></div>}
      <div className="deals-card">
        <p className="text-sm font-medium text-white mb-4">Manual trigger</p>
        <p className="text-xs text-[#555] mb-4">Trigger digest composition and dispatch immediately. Use this if the scheduled job fails.</p>
        <button onClick={trigger} disabled={triggering} className="btn-teal">
          {triggering ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <RefreshCw size={15} />}
          {triggering ? 'Triggering…' : 'Trigger digest for today'}
        </button>
      </div>
    </div>
  );
}

// ─── ADMIN AUDIT ──────────────────────────────────────────────────────────────
export function AdminAudit() {
  const [events, setEvents] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setEvents(await apiFetch(`/admin/audit${filter ? `?event_type=${filter}` : ''}`)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [filter]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-white">Audit log</h1>
        <div className="flex gap-3">
          <input className="deals-input text-sm py-1.5 w-44" placeholder="Filter by event type" value={filter} onChange={e => setFilter(e.target.value)} />
          <a href="/api/admin/audit/export" className="btn-secondary text-xs">Export CSV</a>
        </div>
      </div>
      {loading ? <div className="deals-card h-64 animate-pulse" /> : (
        <div className="deals-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-[#2a2d35]">{['Event', 'Actor', 'Entity', 'IP', 'When'].map(h => <th key={h} className="text-left pb-3 text-[#555] font-normal pr-4">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#1a1d24]">
              {events.map((e: any) => <tr key={e.id}><td className="py-2 pr-4 font-mono text-[#1D9E75]">{e.event_type}</td><td className="py-2 pr-4 text-[#888]">{e.actor_email ?? '—'}</td><td className="py-2 pr-4 text-[#555]">{e.entity_type} {e.entity_id?.slice(0, 8)}</td><td className="py-2 pr-4 text-[#555]">{e.ip_address ?? '—'}</td><td className="py-2 text-[#555]">{new Date(e.created_at).toLocaleString('en-NG')}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
