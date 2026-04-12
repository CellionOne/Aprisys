import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth, apiFetch } from '../../contexts/AuthContext';
import { Plus, TrendingUp, Clock, DollarSign, Users, Zap, Send, FileText, BarChart2, AlertTriangle, CheckCircle, X, Upload, Copy, Download } from 'lucide-react';
import { INSTRUMENT_CONFIG, INSTRUMENT_CATEGORIES, DOC_LABELS, getInstrumentLabel, getInstrumentCategory, getInstrumentsByCategory } from '../../config/instrumentConfig';

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-gray', open: 'badge-blue', funded: 'badge-amber',
  verified: 'badge-amber', completed: 'badge-green', failed: 'badge-red',
  expired: 'badge-gray', disputed: 'badge-red',
};

const CATEGORY_BADGE: Record<string, string> = {
  'Equity & Exchange-traded': 'badge-blue',
  'Money Market': 'badge-amber',
  'Fixed Income': 'badge-teal',
  'Other': 'badge-gray',
};

const AI_DOCS = [
  { key: 'letter_of_offer', label: 'Letter of Offer', endpoint: '/ai/generate-letter-of-offer' },
  { key: 'subscription_agreement', label: 'Subscription Agreement', endpoint: '/ai/generate-subscription-agreement' },
  { key: 'deed_of_assignment', label: 'Deed of Assignment', endpoint: '/ai/generate-deed-of-assignment' },
  { key: 'comfort_letter', label: 'Comfort Letter Request', endpoint: '/ai/generate-comfort-letter' },
];

// ─── DEALS LIST ───────────────────────────────────────────────────────────────
export default function DealsPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [tab, setTab] = useState<'mine' | 'marketplace'>('mine');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setDeals(await apiFetch(`/deals?my_deals=${tab === 'mine'}`)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [tab]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-white">Deals</h1>
        <Link to="/deals/new" className="btn-teal text-sm"><Plus size={15} />New deal</Link>
      </div>
      <div className="flex gap-1 mb-6 bg-[#0a0d12] rounded-lg p-1 w-fit">
        {(['mine', 'marketplace'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-md text-sm transition-colors ${tab === t ? 'bg-[#1D9E75] text-white' : 'text-[#888] hover:text-white'}`}>{t === 'mine' ? 'My deals' : 'Marketplace'}</button>
        ))}
      </div>
      {loading ? (
        <div className="grid md:grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="deals-card h-32 animate-pulse" />)}</div>
      ) : deals.length === 0 ? (
        <div className="deals-card text-center py-16">
          <p className="text-[#555] text-sm">{tab === 'mine' ? 'No deals yet.' : 'No marketplace deals available.'}</p>
          {tab === 'mine' && <Link to="/deals/new" className="btn-teal text-sm mt-4 inline-flex"><Plus size={15} />Create your first deal</Link>}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {deals.map((d: any) => (
            <Link key={d.id} to={`/deals/${d.id}`} className="deals-card hover:border-[#1D9E75]/50 transition-colors block">
              <div className="flex items-start justify-between mb-3">
                <div><p className="text-[10px] text-[#555] font-mono mb-1">{d.reference}</p><p className="text-sm font-semibold text-white">{d.title}</p></div>
                <span className={STATUS_BADGE[d.status] ?? 'badge-gray'}>{d.status}</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap text-xs text-[#888]">
                <span className="flex items-center gap-1"><DollarSign size={11} />₦{((d.total_value ?? 0) / 1e6).toFixed(2)}M</span>
                <span className="flex items-center gap-1"><Users size={11} />{d.party_count ?? 0} parties</span>
                <span className={`${CATEGORY_BADGE[getInstrumentCategory(d.deal_type)] ?? 'badge-gray'} text-[10px]`}>{getInstrumentCategory(d.deal_type)}</span>
                <span className="badge-gray text-[10px]">{getInstrumentLabel(d.deal_type)}</span>
              </div>
              {d.expiry_at && <p className="text-xs text-[#555] mt-2 flex items-center gap-1"><Clock size={10} />Expires {new Date(d.expiry_at).toLocaleDateString('en-NG')}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CREATE DEAL ──────────────────────────────────────────────────────────────
export function CreateDealPage() {
  const navigate = useNavigate();
  const [fields, setFields] = useState({ title: '', deal_type: 'equity', asset_ticker: '', quantity: '', unit_price: '', expiry_at: '', visibility: 'invite_only', commission_pct: '0', notes: '' });
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [aiDesc, setAiDesc] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [marketContext, setMarketContext] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const totalValue = fields.quantity && fields.unit_price ? parseFloat(fields.quantity) * parseFloat(fields.unit_price) : 0;
  const currentConfig = INSTRUMENT_CONFIG[fields.deal_type];
  const byCategory = getInstrumentsByCategory();

  function handleDealTypeChange(t: string) {
    setFields(f => ({ ...f, deal_type: t }));
    setMetadata({});
  }

  async function handleAiAssist() {
    if (!aiDesc.trim()) return;
    setAiLoading(true);
    try {
      const r = await apiFetch<any>('/ai/deal-structure', { method: 'POST', body: JSON.stringify({ description: aiDesc }) });
      setAiResult(r);
      setFields(f => ({ ...f, deal_type: r.deal_type ?? f.deal_type, asset_ticker: r.asset_ticker ?? f.asset_ticker, quantity: String(r.suggested_quantity ?? ''), unit_price: String(r.suggested_price ?? ''), commission_pct: String(r.commission_pct ?? '0') }));
    } catch { alert('AI service unavailable. Fill in manually.'); }
    finally { setAiLoading(false); }
  }

  async function loadMarketContext() {
    if (!fields.asset_ticker || fields.asset_ticker.length < 2) return;
    try { setMarketContext(await apiFetch<any>('/ai/market-context', { method: 'POST', body: JSON.stringify({ ticker: fields.asset_ticker }) })); }
    catch {}
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const deal = await apiFetch<{ id: string }>('/deals', {
        method: 'POST',
        body: JSON.stringify({
          ...fields,
          quantity: parseFloat(fields.quantity) || null,
          unit_price: parseFloat(fields.unit_price) || null,
          total_value: totalValue || null,
          commission_pct: parseFloat(fields.commission_pct) || 0,
          deal_metadata: metadata,
        }),
      });
      navigate(`/deals/${deal.id}`);
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-4">
        <Link to="/deals" className="text-sm text-[#555] hover:text-white">← Back</Link>
        <h1 className="text-2xl font-semibold text-white">New deal</h1>
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-5">
          {/* AI Assist */}
          <div className="deals-card">
            <div className="flex items-center gap-2 mb-3"><Zap size={15} className="text-[#1D9E75]" /><p className="text-sm font-medium text-white">AI deal structuring</p></div>
            <textarea className="deals-input w-full h-20 resize-none text-sm" placeholder="Describe your deal in plain English…" value={aiDesc} onChange={e => setAiDesc(e.target.value)} />
            <button onClick={handleAiAssist} disabled={!aiDesc.trim() || aiLoading} className="btn-teal text-xs mt-2">
              {aiLoading ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Zap size={13} />}
              {aiLoading ? 'Analysing…' : 'Structure with AI'}
            </button>
            {aiResult && <div className="mt-3 p-3 bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-lg text-xs text-[#888]"><p className="text-[#1D9E75] font-medium mb-1">AI suggestion applied</p><p>{aiResult.reasoning}</p></div>}
          </div>

          <form onSubmit={handleSubmit as any} className="space-y-5">
            {/* Instrument type grouped selector */}
            <div className="deals-card space-y-4">
              <p className="text-xs text-[#555] uppercase tracking-wider">Instrument type</p>
              {INSTRUMENT_CATEGORIES.map(cat => (
                <div key={cat}>
                  <p className="text-[10px] text-[#555] font-semibold uppercase tracking-wider mb-2 flex items-center gap-2">
                    <span className={`${CATEGORY_BADGE[cat] ?? 'badge-gray'} text-[9px]`}>{cat}</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(byCategory[cat] ?? []).map(key => (
                      <button key={key} type="button" onClick={() => handleDealTypeChange(key)}
                        className={`text-left px-3 py-2.5 rounded-lg border text-xs transition-all ${fields.deal_type === key ? 'border-[#1D9E75] bg-[#1D9E75]/10 text-white' : 'border-[#2a2d35] bg-[#0a0d12] text-[#888] hover:border-[#1D9E75]/40 hover:text-white'}`}>
                        <p className="font-medium">{INSTRUMENT_CONFIG[key]?.label}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {currentConfig && <p className="text-xs text-[#555] mt-2 italic">{currentConfig.description}</p>}
            </div>

            {/* Core fields */}
            <div className="deals-card space-y-4">
              <div><label className="label text-[#888]">Deal title <span className="text-red-400">*</span></label><input className="deals-input" value={fields.title} onChange={e => setFields(f => ({ ...f, title: e.target.value }))} required /></div>
              <div><label className="label text-[#888]">Asset ticker (NGX)</label>
                <input className="deals-input" value={fields.asset_ticker} onChange={e => setFields(f => ({ ...f, asset_ticker: e.target.value.toUpperCase() }))} onBlur={loadMarketContext} placeholder="e.g. DANGCEM" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label text-[#888]">Quantity (units)</label><input type="number" className="deals-input" value={fields.quantity} onChange={e => setFields(f => ({ ...f, quantity: e.target.value }))} /></div>
                <div><label className="label text-[#888]">Unit price (₦)</label><input type="number" className="deals-input" value={fields.unit_price} onChange={e => setFields(f => ({ ...f, unit_price: e.target.value }))} /></div>
              </div>
              {totalValue > 0 && <div className="p-3 bg-[#0a0d12] rounded-lg"><p className="text-xs text-[#555]">Total deal value</p><p className="text-lg font-semibold text-white">₦{totalValue.toLocaleString()}</p></div>}
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label text-[#888]">Expiry date</label><input type="datetime-local" className="deals-input" value={fields.expiry_at} onChange={e => setFields(f => ({ ...f, expiry_at: e.target.value }))} /></div>
                <div><label className="label text-[#888]">Visibility</label>
                  <select className="deals-input" value={fields.visibility} onChange={e => setFields(f => ({ ...f, visibility: e.target.value }))}>
                    <option value="private">Private</option>
                    <option value="invite_only">Invite only</option>
                    <option value="marketplace">Marketplace</option>
                  </select>
                </div>
              </div>
              <div><label className="label text-[#888]">Commission (%)</label><input type="number" step="0.1" className="deals-input" value={fields.commission_pct} onChange={e => setFields(f => ({ ...f, commission_pct: e.target.value }))} /></div>
              <div><label className="label text-[#888]">Notes (optional)</label><textarea className="deals-input w-full h-16 resize-none text-sm" value={fields.notes} onChange={e => setFields(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>

            {/* Dynamic metadata fields */}
            {(currentConfig?.metadata_fields ?? []).length > 0 && (
              <div className="deals-card space-y-4">
                <p className="text-xs text-[#555] uppercase tracking-wider">{getInstrumentLabel(fields.deal_type)} — instrument details</p>
                <div className="grid grid-cols-2 gap-4">
                  {(currentConfig.metadata_fields as any[]).map((f: any) => (
                    <div key={f.key} className={f.type === 'text' && !f.options ? 'col-span-2' : ''}>
                      <label className="label text-[#888]">{f.label}{f.required && <span className="text-red-400 ml-1">*</span>}</label>
                      {f.type === 'select' ? (
                        <select className="deals-input" value={metadata[f.key] ?? ''} onChange={e => setMetadata(m => ({ ...m, [f.key]: e.target.value }))}>
                          <option value="">Select…</option>
                          {(f.options as any[]).map((o: any) => <option key={String(o)} value={String(o)}>{o}</option>)}
                        </select>
                      ) : (
                        <input type={f.type} className="deals-input" value={metadata[f.key] ?? ''} onChange={e => setMetadata(m => ({ ...m, [f.key]: e.target.value }))} required={f.required} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button type="submit" className="btn-teal w-full" disabled={saving || !fields.title}>{saving ? 'Creating…' : 'Create deal'}</button>
          </form>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {marketContext ? (
            <div className="deals-card">
              <div className="flex items-center gap-2 mb-3"><TrendingUp size={14} className="text-[#1D9E75]" /><p className="text-sm font-medium text-white">{fields.asset_ticker} context</p></div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-[#888]">IAS score</span><span className="text-white font-semibold">{marketContext.ias_score?.toFixed(1)}</span></div>
                <div className="flex justify-between"><span className="text-[#888]">Trend</span><span className={`capitalize ${marketContext.ias_trend === 'improving' ? 'text-green-400' : marketContext.ias_trend === 'declining' ? 'text-red-400' : 'text-amber-400'}`}>{marketContext.ias_trend}</span></div>
                {marketContext.fair_value_range && <div className="flex justify-between"><span className="text-[#888]">Fair value</span><span className="text-white">₦{marketContext.fair_value_range.low}–{marketContext.fair_value_range.high}</span></div>}
                {marketContext.ai_commentary && <p className="text-xs text-[#555] leading-relaxed border-t border-[#2a2d35] pt-3">{marketContext.ai_commentary}</p>}
              </div>
            </div>
          ) : (
            <div className="deals-card text-center py-8"><TrendingUp size={20} className="text-[#2a2d35] mx-auto mb-2" /><p className="text-xs text-[#555]">Enter an NGX ticker for AI market context</p></div>
          )}

          {/* Required documents preview */}
          {currentConfig && (
            <div className="deals-card">
              <p className="text-xs text-[#555] uppercase tracking-wider mb-3">Required documents</p>
              {(currentConfig.mandatory_docs ?? []).length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] text-red-400 font-medium uppercase mb-2">Mandatory</p>
                  <div className="space-y-1.5">
                    {(currentConfig.mandatory_docs as string[]).map((d: string) => (
                      <div key={d} className="flex items-center gap-2 text-xs"><span className="w-2 h-2 rounded-full bg-red-500 shrink-0" /><span className="text-[#888]">{DOC_LABELS[d] ?? d}</span></div>
                    ))}
                  </div>
                </div>
              )}
              {(currentConfig.warning_docs ?? []).length > 0 && (
                <div>
                  <p className="text-[10px] text-amber-400 font-medium uppercase mb-2">Recommended</p>
                  <div className="space-y-1.5">
                    {(currentConfig.warning_docs as string[]).map((d: string) => (
                      <div key={d} className="flex items-center gap-2 text-xs"><span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" /><span className="text-[#888]">{DOC_LABELS[d] ?? d}</span></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DEAL DETAIL ──────────────────────────────────────────────────────────────
export function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { subscriber, accessToken } = useAuth();
  const [deal, setDeal] = useState<any>(null);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [ws, setWs] = useState<WebSocket | null>(null);
  const msgEnd = useRef<HTMLDivElement>(null);

  // Document upload
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docType, setDocType] = useState('other');
  const [docUploading, setDocUploading] = useState(false);

  // Admin override
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [overriding, setOverriding] = useState(false);

  // AI doc generation
  const [aiGenerating, setAiGenerating] = useState<string | null>(null);
  const [aiDocModal, setAiDocModal] = useState<{ title: string; doc_type: string; content: string } | null>(null);

  async function loadDeal() {
    try { setDeal(await apiFetch<any>(`/deals/${id}`)); }
    catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { loadDeal(); }, [id]);

  useEffect(() => {
    if (tab !== 'room' || !accessToken || !id) return;
    const token = localStorage.getItem('aprisys_access');
    const socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/deals/${id}?token=${token}`);
    socket.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'history') setMessages(data.payload);
      else if (data.type === 'message') setMessages(p => [...p, data.payload]);
    };
    setWs(socket);
    return () => socket.close();
  }, [tab, id, accessToken]);

  useEffect(() => { msgEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  function sendMessage(e: FormEvent) {
    e.preventDefault();
    if (!newMsg.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ message: newMsg.trim(), message_type: 'text' }));
    setNewMsg('');
  }

  async function uploadDoc() {
    if (!docFile) return;
    setDocUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', docFile);
      formData.append('document_type', docType);
      const token = localStorage.getItem('aprisys_access');
      const res = await fetch(`/api/deals/${id}/documents`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? 'Upload failed'); }
      setDocFile(null);
      await loadDeal();
    } catch (err: any) { alert(err.message); }
    finally { setDocUploading(false); }
  }

  async function handleOverride() {
    if (!overrideReason.trim()) return;
    setOverriding(true);
    try {
      await apiFetch(`/admin/deals/${id}/checklist/override`, { method: 'POST', body: JSON.stringify({ reason: overrideReason }) });
      setOverrideOpen(false);
      setOverrideReason('');
      await loadDeal();
    } catch (err: any) { alert(err.message); }
    finally { setOverriding(false); }
  }

  async function generateAiDoc(endpoint: string, docKey: string, docTitle: string) {
    setAiGenerating(docKey);
    try {
      const r = await apiFetch<{ document: string; doc_type: string }>(endpoint, { method: 'POST', body: JSON.stringify({ deal_id: id }) });
      setAiDocModal({ title: docTitle, doc_type: docKey, content: r.document });
      await loadDeal();
    } catch (err: any) { alert(err.message ?? 'AI service unavailable'); }
    finally { setAiGenerating(null); }
  }

  function downloadTxt(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-5 h-5 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" /></div>;
  if (!deal) return <div className="deals-card text-center py-12"><p className="text-[#555]">Deal not found</p></div>;

  const tabs = ['overview', 'room', 'documents', 'escrow'];
  const checklist = deal.regulatory_checklist ?? { mandatory: [], recommended: [] };
  const uploadedTypes = new Set((deal.documents ?? []).map((d: any) => d.document_type));
  const mandatoryDocs: any[] = checklist.mandatory ?? [];
  const recommendedDocs: any[] = checklist.recommended ?? [];
  const uploadedMandatoryCount = mandatoryDocs.filter((m: any) => uploadedTypes.has(m.doc_type)).length;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-xs text-[#555] font-mono mb-1">{deal.reference}</p>
          <h1 className="text-xl font-semibold text-white">{deal.title}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className={STATUS_BADGE[deal.status] ?? 'badge-gray'}>{deal.status}</span>
            <span className={`${CATEGORY_BADGE[getInstrumentCategory(deal.deal_type)] ?? 'badge-gray'} text-[10px]`}>{getInstrumentCategory(deal.deal_type)}</span>
            <span className="badge-gray text-[10px]">{getInstrumentLabel(deal.deal_type)}</span>
            {deal.total_value && <span className="text-xs text-[#888]">₦{(deal.total_value / 1e6).toFixed(2)}M</span>}
          </div>
        </div>
        <Link to="/deals" className="text-xs text-[#555] hover:text-white">← Back</Link>
      </div>

      <div className="flex gap-1 mb-5 bg-[#0a0d12] rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-md text-sm capitalize transition-colors ${tab === t ? 'bg-[#1D9E75] text-white' : 'text-[#888] hover:text-white'}`}>{t === 'room' ? 'Deal room' : t}</button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid md:grid-cols-3 gap-5">
          <div className="md:col-span-2 space-y-4">
            <div className="deals-card">
              <p className="text-xs text-[#555] uppercase tracking-wider mb-4">Deal terms</p>
              <div className="grid grid-cols-2 gap-y-3 text-sm">
                {[['Type', getInstrumentLabel(deal.deal_type)], ['Asset', deal.asset_ticker || '—'], ['Quantity', deal.quantity?.toLocaleString() || '—'], ['Unit price', deal.unit_price ? `₦${deal.unit_price}` : '—'], ['Total value', deal.total_value ? `₦${deal.total_value.toLocaleString()}` : '—'], ['Commission', `${deal.commission_pct ?? 0}%`], ['Visibility', deal.visibility], ['Expires', deal.expiry_at ? new Date(deal.expiry_at).toLocaleDateString('en-NG') : '—']].map(([k, v]) => (
                  <div key={k}><p className="text-[#555] text-xs">{k}</p><p className="text-white font-medium">{v}</p></div>
                ))}
              </div>
            </div>
            {/* Deal metadata */}
            {deal.deal_metadata && Object.keys(deal.deal_metadata).length > 0 && (
              <div className="deals-card">
                <p className="text-xs text-[#555] uppercase tracking-wider mb-3">Instrument details</p>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  {Object.entries(deal.deal_metadata).map(([k, v]) => (
                    <div key={k}><p className="text-[#555] text-xs capitalize">{k.replace(/_/g, ' ')}</p><p className="text-white text-sm">{String(v)}</p></div>
                  ))}
                </div>
              </div>
            )}
            {deal.cie_risk_score && (
              <div className="deals-card">
                <div className="flex items-center justify-between mb-2"><p className="text-xs text-[#555] uppercase tracking-wider">AI risk score</p><span className={`text-lg font-bold ${deal.cie_risk_score <= 3 ? 'text-green-400' : deal.cie_risk_score <= 6 ? 'text-amber-400' : 'text-red-400'}`}>{deal.cie_risk_score}/10</span></div>
                <p className="text-xs text-[#555]">{deal.cie_risk_score <= 3 ? 'Low risk' : deal.cie_risk_score <= 6 ? 'Medium risk' : 'High risk'}</p>
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div className="deals-card">
              <p className="text-xs text-[#555] uppercase tracking-wider mb-3">Parties ({deal.parties?.length ?? 0})</p>
              <div className="space-y-2">
                {(deal.parties ?? []).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <div><p className="text-white font-medium">{p.name}</p><p className="text-xs text-[#555] capitalize">{p.role}</p></div>
                    <span className={p.kyc_status === 'verified' ? 'badge-teal text-[10px]' : 'badge-gray text-[10px]'}>{p.kyc_status === 'verified' ? '✓ KYC' : 'Pending'}</span>
                  </div>
                ))}
              </div>
              {deal.created_by === subscriber?.id && (
                <Link to={`/deals/${id}/invite`} className="btn-teal text-xs w-full mt-3"><Plus size={13} />Invite party</Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Deal Room */}
      {tab === 'room' && (
        <div className="deals-card flex flex-col" style={{ height: '60vh' }}>
          <div className="flex-1 overflow-y-auto space-y-3 mb-4">
            {messages.map((m: any) => {
              const isMe = m.sender_id === subscriber?.id;
              return (
                <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs lg:max-w-md rounded-xl px-4 py-2.5 ${isMe ? 'bg-[#1D9E75] text-white' : m.message_type === 'system' ? 'bg-[#0a0d12] text-[#555] text-xs italic text-center w-full' : 'bg-[#2a2d35] text-white'}`}>
                    {!isMe && m.message_type !== 'system' && <p className="text-[10px] text-[#888] mb-1">{m.sender_name ?? 'Unknown'}</p>}
                    <p className="text-sm">{m.message}</p>
                    <p className={`text-[10px] mt-1 ${isMe ? 'text-white/60' : 'text-[#555]'}`}>{new Date(m.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              );
            })}
            <div ref={msgEnd} />
          </div>
          <form onSubmit={sendMessage as any} className="flex gap-3">
            <input className="deals-input flex-1" value={newMsg} onChange={e => setNewMsg(e.target.value)} placeholder="Type a message…" />
            <button type="submit" disabled={!newMsg.trim()} className="btn-teal px-4 disabled:opacity-50"><Send size={15} /></button>
          </form>
        </div>
      )}

      {/* Documents */}
      {tab === 'documents' && (
        <div className="space-y-5">

          {/* Section A — Regulatory checklist */}
          {mandatoryDocs.length > 0 && (
            <div className="deals-card">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-[#555] uppercase tracking-wider">Regulatory checklist</p>
                <span className={`text-xs font-medium ${uploadedMandatoryCount === mandatoryDocs.length ? 'text-green-400' : 'text-amber-400'}`}>
                  {uploadedMandatoryCount} of {mandatoryDocs.length} mandatory uploaded
                </span>
              </div>

              {deal.checklist_override && (
                <div className="mb-4 px-4 py-3 bg-[#1D9E75]/10 border border-[#1D9E75]/30 rounded-lg text-xs text-[#1D9E75]">
                  <p className="font-medium">Checklist override applied by admin</p>
                  {deal.checklist_override_reason && <p className="text-[#888] mt-1">{deal.checklist_override_reason}</p>}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-red-400 font-semibold uppercase mb-2">Mandatory documents</p>
                  <div className="space-y-2">
                    {mandatoryDocs.map((m: any) => {
                      const uploaded = uploadedTypes.has(m.doc_type);
                      return (
                        <div key={m.doc_type} className="flex items-center gap-2 text-xs">
                          {uploaded ? <CheckCircle size={13} className="text-green-400 shrink-0" /> : <X size={13} className="text-red-400 shrink-0" />}
                          <span className={uploaded ? 'text-white' : 'text-[#888]'}>{m.label ?? DOC_LABELS[m.doc_type] ?? m.doc_type}</span>
                          {!uploaded && <span className="ml-auto badge-red text-[9px]">Required</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-amber-400 font-semibold uppercase mb-2">Recommended documents</p>
                  <div className="space-y-2">
                    {recommendedDocs.map((r: any) => {
                      const uploaded = uploadedTypes.has(r.doc_type);
                      return (
                        <div key={r.doc_type} className="flex items-center gap-2 text-xs">
                          {uploaded ? <CheckCircle size={13} className="text-green-400 shrink-0" /> : <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />}
                          <span className={uploaded ? 'text-white' : 'text-[#888]'}>{r.label ?? DOC_LABELS[r.doc_type] ?? r.doc_type}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {subscriber?.is_admin && !deal.checklist_override && uploadedMandatoryCount < mandatoryDocs.length && (
                <button onClick={() => setOverrideOpen(true)} className="mt-4 btn-teal text-xs">Override checklist</button>
              )}
            </div>
          )}

          {/* Section B — AI document generator */}
          <div className="deals-card">
            <div className="mb-4">
              <p className="text-sm font-medium text-white">AI Legal Documents</p>
              <p className="text-xs text-[#555] mt-1">Generated using Nigerian legal standards. Review before use.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {AI_DOCS.map(({ key, label, endpoint }) => {
                const existing = deal.ai_documents?.[key];
                const isGenerating = aiGenerating === key;
                return (
                  <div key={key} className="p-3 bg-[#0a0d12] rounded-lg border border-[#2a2d35]">
                    <p className="text-xs text-[#888] mb-3 font-medium">{label}</p>
                    <div className="flex gap-2">
                      {existing && (
                        <button onClick={() => setAiDocModal({ title: label, doc_type: key, content: existing.content })} className="btn-teal text-[10px] flex-1">View</button>
                      )}
                      <button onClick={() => generateAiDoc(endpoint, key, label)} disabled={isGenerating} className={`text-[10px] flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border transition-colors ${existing ? 'border-[#2a2d35] text-[#555] hover:text-white hover:border-[#555]' : 'btn-teal'} disabled:opacity-50`}>
                        {isGenerating ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> : null}
                        {isGenerating ? 'Generating…' : existing ? 'Regenerate' : 'Generate'}
                      </button>
                    </div>
                    {existing && <p className="text-[9px] text-[#555] mt-2">Last generated {new Date(existing.generated_at).toLocaleDateString('en-NG')}</p>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section C — Upload + document list */}
          <div className="deals-card">
            <p className="text-xs text-[#555] uppercase tracking-wider mb-4">Upload document</p>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="label text-[#888]">Document type</label>
                <select className="deals-input" value={docType} onChange={e => setDocType(e.target.value)}>
                  {Object.entries(DOC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="label text-[#888]">File (PDF, JPG, PNG, DOCX, TXT)</label>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.txt" className="deals-input text-xs" onChange={e => setDocFile(e.target.files?.[0] ?? null)} />
              </div>
              <button onClick={uploadDoc} disabled={!docFile || docUploading} className="btn-teal text-xs disabled:opacity-50 flex items-center gap-1.5">
                {docUploading ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Upload size={13} />}
                {docUploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>

            {(deal.documents ?? []).length > 0 && (
              <div className="mt-5 space-y-2">
                <p className="text-xs text-[#555] uppercase tracking-wider mb-2">Uploaded documents ({deal.documents.length})</p>
                {(deal.documents ?? []).map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-[#0a0d12] rounded-lg">
                    <div className="flex items-center gap-3"><FileText size={14} className="text-[#555] shrink-0" /><div><p className="text-sm text-white">{doc.filename}</p><p className="text-xs text-[#555] capitalize">{DOC_LABELS[doc.document_type] ?? doc.document_type} · v{doc.version}</p></div></div>
                    <a href={`/api/deals/${id}/documents/${doc.id}/download`} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1D9E75] hover:underline flex items-center gap-1"><Download size={11} />Download</a>
                  </div>
                ))}
              </div>
            )}
            {(deal.documents ?? []).length === 0 && <p className="text-sm text-[#555] text-center py-6 mt-3">No documents uploaded yet</p>}
          </div>
        </div>
      )}

      {/* Escrow */}
      {tab === 'escrow' && (
        <div className="deals-card">
          <p className="text-xs text-[#555] uppercase tracking-wider mb-4">Escrow</p>
          {!deal.escrow || deal.escrow.status === 'no_escrow' ? (
            <div className="text-center py-8">
              <DollarSign size={24} className="text-[#2a2d35] mx-auto mb-3" />
              <p className="text-sm text-[#555] mb-4">No escrow yet</p>
              {deal.status === 'open' && deal.total_value && (
                <button onClick={async () => {
                  try {
                    const r = await apiFetch<{ authorization_url: string }>('/escrow/initialise', { method: 'POST', body: JSON.stringify({ deal_id: id }) });
                    window.location.href = r.authorization_url;
                  } catch (err: any) { alert(err.message); }
                }} className="btn-teal">
                  <DollarSign size={15} />Fund escrow — ₦{(deal.total_value / 1e6).toFixed(2)}M
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between"><span className="text-[#888]">Status</span><span className={STATUS_BADGE[deal.escrow.status] ?? 'badge-gray'}>{deal.escrow.status}</span></div>
              <div className="flex items-center justify-between"><span className="text-[#888]">Amount</span><span className="text-white font-semibold">₦{deal.escrow.amount?.toLocaleString()}</span></div>
              {deal.escrow.funded_at && <div className="flex items-center justify-between"><span className="text-[#888]">Funded</span><span className="text-white">{new Date(deal.escrow.funded_at).toLocaleDateString('en-NG')}</span></div>}
              <div>
                <p className="text-xs text-[#555] mb-2">Conditions</p>
                {(deal.escrow.conditions ?? []).map((c: any) => (
                  <div key={c.id} className="flex items-center gap-2 text-sm mb-2">
                    <span className={c.met ? 'text-[#1D9E75]' : 'text-[#555]'}>{c.met ? <CheckCircle size={14} /> : <Clock size={14} />}</span>
                    <span className={c.met ? 'text-white' : 'text-[#555]'}>{c.description}</span>
                    {!c.met && <button onClick={async () => { await apiFetch(`/escrow/${id}/mark-condition/${c.id}`, { method: 'POST', body: JSON.stringify({ evidence: 'Confirmed' }) }); loadDeal(); }} className="ml-auto text-xs text-[#1D9E75] hover:underline">Mark met</button>}
                  </div>
                ))}
              </div>
              {!['completed', 'failed', 'refunded', 'disputed'].includes(deal.escrow.status) && (
                <button onClick={async () => { if (!confirm('Raise a dispute on this escrow?')) return; await apiFetch(`/escrow/${id}/dispute`, { method: 'POST', body: JSON.stringify({ reason: prompt('Reason for dispute:') ?? 'Disputed' }) }); loadDeal(); }} className="btn-secondary text-xs text-red-500 border-red-200">
                  <AlertTriangle size={13} />Raise dispute
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* AI document modal */}
      {aiDocModal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="bg-[#14171e] border border-[#2a2d35] rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-[#2a2d35]">
              <div><p className="text-white font-semibold">{aiDocModal.title}</p><p className="text-xs text-[#555]">{deal.reference}</p></div>
              <button onClick={() => setAiDocModal(null)} className="text-[#555] hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <pre className="text-sm text-white font-mono leading-relaxed whitespace-pre-wrap bg-[#0a0d12] p-4 rounded-lg">{aiDocModal.content}</pre>
            </div>
            <div className="p-5 border-t border-[#2a2d35] space-y-3">
              <p className="text-xs text-amber-400 leading-relaxed">⚠ This document is AI-generated and must be reviewed by a qualified Nigerian legal practitioner before execution. Aprisys and Cellion One accept no liability for documents used without professional review.</p>
              <div className="flex gap-3">
                <button onClick={() => navigator.clipboard.writeText(aiDocModal.content).then(() => alert('Copied!'))} className="btn-teal text-xs flex-1 flex items-center justify-center gap-1.5"><Copy size={13} />Copy to clipboard</button>
                <button onClick={() => downloadTxt(aiDocModal.content, `${aiDocModal.doc_type}-${deal.reference}.txt`)} className="btn-secondary text-xs flex-1 flex items-center justify-center gap-1.5"><Download size={13} />Download .txt</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin override modal */}
      {overrideOpen && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="bg-[#14171e] border border-[#2a2d35] rounded-xl w-full max-w-md p-6">
            <h2 className="text-white font-semibold mb-2">Override document checklist</h2>
            <p className="text-sm text-[#888] mb-4">Provide a reason. This will be logged in the audit trail.</p>
            <textarea className="deals-input w-full h-20 resize-none text-sm mb-4" placeholder="Reason for override…" value={overrideReason} onChange={e => setOverrideReason(e.target.value)} />
            <div className="flex gap-3">
              <button onClick={handleOverride} disabled={!overrideReason.trim() || overriding} className="btn-teal text-xs flex-1">{overriding ? 'Applying…' : 'Apply override'}</button>
              <button onClick={() => { setOverrideOpen(false); setOverrideReason(''); }} className="text-xs flex-1 px-3 py-2 rounded-lg border border-[#2a2d35] text-[#888] hover:text-white">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MARKETPLACE ──────────────────────────────────────────────────────────────
export function MarketplacePage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { apiFetch<any[]>('/deals?my_deals=false').then(setDeals).catch(() => {}).finally(() => setLoading(false)); }, []);

  const byCategory = deals.reduce<Record<string, any[]>>((acc, d) => {
    const cat = getInstrumentCategory(d.deal_type);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(d);
    return acc;
  }, {});

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-6">Marketplace</h1>
      {loading ? (
        <div className="grid md:grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="deals-card h-32 animate-pulse" />)}</div>
      ) : deals.length === 0 ? (
        <div className="deals-card text-center py-12"><p className="text-[#555]">No marketplace deals available</p></div>
      ) : (
        <div className="space-y-8">
          {INSTRUMENT_CATEGORIES.filter(cat => byCategory[cat]?.length > 0).map(cat => (
            <div key={cat}>
              <div className="flex items-center gap-3 mb-4">
                <span className={`${CATEGORY_BADGE[cat] ?? 'badge-gray'}`}>{cat}</span>
                <span className="text-xs text-[#555]">{byCategory[cat].length} deal{byCategory[cat].length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {byCategory[cat].map((d: any) => (
                  <Link key={d.id} to={`/deals/${d.id}`} className="deals-card hover:border-[#1D9E75]/50 transition-colors block">
                    <p className="text-[10px] font-mono text-[#555] mb-1">{d.reference}</p>
                    <p className="text-sm font-semibold text-white mb-2">{d.title}</p>
                    <div className="flex gap-3 text-xs text-[#888]">
                      <span>{getInstrumentLabel(d.deal_type)}</span>
                      <span>₦{((d.total_value ?? 0)/1e6).toFixed(2)}M</span>
                      <span className="flex items-center gap-1"><Users size={11} />{d.party_count ?? 0}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PORTFOLIO ────────────────────────────────────────────────────────────────
export function PortfolioPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { apiFetch<any[]>('/portfolio').then(setDeals).catch(() => {}).finally(() => setLoading(false)); }, []);
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-6">Portfolio</h1>
      {loading ? <div className="deals-card h-64 animate-pulse" />
        : deals.length === 0 ? <div className="deals-card text-center py-12"><BarChart2 size={24} className="text-[#2a2d35] mx-auto mb-3" /><p className="text-[#555] text-sm">No deals in your portfolio yet</p></div>
        : <div className="deals-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[#2a2d35]">{['Reference', 'Instrument', 'Role', 'Value', 'Status', 'Commission'].map(h => <th key={h} className="text-left pb-3 text-xs text-[#555] font-normal pr-4">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[#1a1d24]">
                {deals.map((d: any) => <tr key={d.id}><td className="py-3 pr-4 font-mono text-xs text-[#888]">{d.reference}</td><td className="py-3 pr-4 text-[#888]">{getInstrumentLabel(d.deal_type)}</td><td className="py-3 pr-4 text-white capitalize">{d.role}</td><td className="py-3 pr-4 text-white">₦{((d.total_value ?? 0)/1e6).toFixed(2)}M</td><td className="py-3 pr-4"><span className={STATUS_BADGE[d.status] ?? 'badge-gray'}>{d.status}</span></td><td className="py-3 text-[#1D9E75]">₦{(d.commission_earned ?? 0).toLocaleString()}</td></tr>)}
              </tbody>
            </table>
          </div>
      }
    </div>
  );
}

type FormEvent = React.FormEvent<HTMLFormElement>;
