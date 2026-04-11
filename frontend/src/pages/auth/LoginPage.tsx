import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, apiFetch } from '../../contexts/AuthContext';
import { TrendingUp, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';

function AuthWrap({ children, title, sub }: { children: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-8 h-8 bg-[#1a1a1a] rounded-lg flex items-center justify-center"><TrendingUp size={16} color="white" /></div>
          <div><p className="text-sm font-semibold leading-none">Aprisys</p><p className="text-xs text-[#aaa] mt-0.5">powered by Cellion One</p></div>
        </div>
        <div className="card">
          <h1 className="text-xl font-semibold mb-1">{title}</h1>
          {sub && <p className="text-sm text-[#888] mb-6">{sub}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

// LOGIN
export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try { await login(email, password); navigate('/retail/dashboard'); }
    catch (err: any) {
      if (err.message?.includes('suspended')) setError(`Account suspended: ${err.message.split('suspended')[1] || ''}`);
      else setError(err.message);
    }
    finally { setLoading(false); }
  }

  return (
    <AuthWrap title="Welcome back" sub="Sign in to your account">
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2 text-sm text-red-700"><AlertCircle size={16} className="shrink-0 mt-0.5" />{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div><label className="label">Email</label><input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus /></div>
        <div>
          <div className="flex justify-between items-center mb-1.5"><label className="label" style={{ marginBottom: 0 }}>Password</label><Link to="/forgot-password" className="text-xs text-[#888] hover:text-[#1a1a1a]">Forgot?</Link></div>
          <div className="relative"><input type={show ? 'text' : 'password'} className="input pr-10" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required /><button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#aaa]">{show ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div className="relative my-5"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#e5e4e0]" /></div><div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-[#aaa]">or</span></div></div>
      <a href="/api/auth/google" className="btn-secondary w-full">
        <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Continue with Google
      </a>
      <p className="text-center text-sm text-[#888] mt-5">No account? <Link to="/register" className="text-[#1a1a1a] font-medium hover:underline">Create one free</Link></p>
      <p className="text-center text-xs text-[#aaa] mt-2"><Link to="/deals-landing" className="hover:underline">Professional & institutional →</Link></p>
    </AuthWrap>
  );
}

export function RegisterPage() {
  const [step, setStep] = useState(1);
  const [accountType, setAccountType] = useState('retail');
  const [fields, setFields] = useState({ name: '', email: '', password: '', phone: '', consent: false });
  const [done, setDone] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const types = [
    { key: 'retail', label: 'Retail individual', desc: 'Access market digest and signals', docs: 'Email verification only' },
    { key: 'qualified', label: 'Qualified individual', desc: 'Access retail + deal participation', docs: 'NIN, BVN, ID, net worth declaration' },
    { key: 'broker', label: 'Stockbroker / Dealer', desc: 'Create and manage deals, earn commission', docs: 'SEC licence, NGX membership, CSCS code' },
    { key: 'fund_manager', label: 'Fund manager', desc: 'Lead deals and deploy capital at scale', docs: 'SEC fund manager licence, CAC, directors\' IDs' },
    { key: 'corporate', label: 'Corporate investor', desc: 'Participate in deals on behalf of a company', docs: 'CAC certificate, TIN, board resolution' },
    { key: 'institutional', label: 'Bank / Pension fund', desc: 'Full platform access, large-ticket deals', docs: 'CAC, CBN/PenCom licence, AML policy, board resolution' },
  ];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await apiFetch<{ message: string }>('/auth/register', { method: 'POST', body: JSON.stringify({ ...fields, account_type: accountType, consent: 'true' }), skipAuth: true });
      setNeedsVerification(res.message?.includes('verify'));
      setDone(true);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  if (done) return (
    <AuthWrap title={needsVerification ? 'Check your email' : 'Account created'} sub="">
      <div className="text-center py-4">
        <CheckCircle size={32} className="text-green-500 mx-auto mb-3" />
        {needsVerification ? (
          <p className="text-sm text-[#888] mb-5">We've sent a verification link to <strong>{fields.email}</strong>. Click it to activate your account.</p>
        ) : (
          <p className="text-sm text-[#888] mb-5">Your account is ready. You can sign in now.</p>
        )}
        <Link to="/login" className="btn-secondary w-full">Sign in</Link>
      </div>
    </AuthWrap>
  );

  if (step === 1) return (
    <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-2.5 mb-8"><div className="w-8 h-8 bg-[#1a1a1a] rounded-lg flex items-center justify-center"><TrendingUp size={16} color="white" /></div><p className="text-sm font-semibold">Aprisys</p></div>
        <div className="card">
          <h1 className="text-xl font-semibold mb-1">Create your account</h1>
          <p className="text-sm text-[#888] mb-6">Select the account type that best describes you. This determines your KYC requirements.</p>
          <div className="grid md:grid-cols-2 gap-3 mb-6">
            {types.map(t => (
              <button key={t.key} onClick={() => setAccountType(t.key)}
                className={`text-left p-4 rounded-xl border transition-all ${accountType === t.key ? 'border-[#1a1a1a] bg-[#f8f7f4]' : 'border-[#e5e4e0] hover:border-[#1a1a1a]/30'}`}>
                <p className="text-sm font-medium mb-1">{t.label}</p>
                <p className="text-xs text-[#888] mb-2">{t.desc}</p>
                <p className="text-[10px] text-[#bbb]">Requires: {t.docs}</p>
              </button>
            ))}
          </div>
          <button onClick={() => setStep(2)} className="btn-primary w-full">Continue as {types.find(t => t.key === accountType)?.label} →</button>
          <p className="text-center text-sm text-[#888] mt-4">Already have an account? <Link to="/login" className="text-[#1a1a1a] font-medium hover:underline">Sign in</Link></p>
        </div>
      </div>
    </div>
  );

  return (
    <AuthWrap title="Create account" sub={`Registering as: ${types.find(t => t.key === accountType)?.label}`}>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div><label className="label">Full name</label><input className="input" value={fields.name} onChange={e => setFields(f => ({ ...f, name: e.target.value }))} required /></div>
        <div><label className="label">Email</label><input type="email" className="input" value={fields.email} onChange={e => setFields(f => ({ ...f, email: e.target.value }))} required /></div>
        <div><label className="label">Password</label><input type="password" className="input" value={fields.password} onChange={e => setFields(f => ({ ...f, password: e.target.value }))} placeholder="At least 8 characters" required minLength={8} /></div>
        <div><label className="label">Phone <span className="text-[#bbb] normal-case font-normal">(optional)</span></label><input type="tel" className="input" value={fields.phone} onChange={e => setFields(f => ({ ...f, phone: e.target.value }))} placeholder="+2348012345678" /></div>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" className="mt-0.5 w-4 h-4 accent-[#1a1a1a]" checked={fields.consent} onChange={e => setFields(f => ({ ...f, consent: e.target.checked }))} required />
          <span className="text-xs text-[#666] leading-5">I agree to the <a href="#" className="underline">privacy policy</a> and consent to receive communications. Required under NDPR.</span>
        </label>
        <button type="submit" className="btn-primary w-full" disabled={loading || !fields.consent}>
          {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <button onClick={() => setStep(1)} className="w-full text-center text-xs text-[#888] mt-3 hover:text-[#1a1a1a]">← Change account type</button>
    </AuthWrap>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setLoading(true);
    try { await apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }), skipAuth: true }); setDone(true); }
    catch { setDone(true); }
    finally { setLoading(false); }
  }

  return (
    <AuthWrap title="Forgot password" sub="Enter your email and we'll send a reset link">
      {done ? (
        <div className="text-center py-4"><CheckCircle size={32} className="text-green-500 mx-auto mb-3" /><p className="text-sm text-[#888] mb-4">If that email is registered, a reset link has been sent.</p><Link to="/login" className="btn-secondary w-full">Back to sign in</Link></div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="label">Email</label><input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} required autoFocus /></div>
          <button type="submit" className="btn-primary w-full" disabled={loading}>{loading ? 'Sending…' : 'Send reset link'}</button>
          <p className="text-center text-sm text-[#888]"><Link to="/login" className="hover:text-[#1a1a1a]">← Back to sign in</Link></p>
        </form>
      )}
    </AuthWrap>
  );
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const token = new URLSearchParams(window.location.search).get('token') ?? '';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try { await apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }), skipAuth: true }); setDone(true); }
    catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <AuthWrap title="Set new password" sub="">
      {done ? (
        <div className="text-center py-4"><CheckCircle size={32} className="text-green-500 mx-auto mb-3" /><p className="text-sm text-[#888] mb-4">Password updated. You can now sign in.</p><Link to="/login" className="btn-primary w-full">Sign in</Link></div>
      ) : (
        <>
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="label">New password</label><input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8} autoFocus /></div>
            <button type="submit" className="btn-primary w-full" disabled={loading || !token}>{loading ? 'Updating…' : 'Set new password'}</button>
          </form>
        </>
      )}
    </AuthWrap>
  );
}

export function VerifiedPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const refresh = params.get('refresh');
  if (token) {
    localStorage.setItem('aprisys_access', token);
    if (refresh) localStorage.setItem('aprisys_refresh', refresh);
    window.location.href = '/retail/dashboard';
  }
  return null;
}

export function AuthCallbackPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const refresh = params.get('refresh');
  if (token) {
    localStorage.setItem('aprisys_access', token);
    if (refresh) localStorage.setItem('aprisys_refresh', refresh);
    window.location.href = '/retail/dashboard';
  }
  return null;
}

export function KYCPage() {
  const { subscriber, refresh } = useAuth();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const accountType = subscriber?.account_type ?? 'retail';

  const fieldsByType: Record<string, string[]> = {
    qualified: ['nin', 'bvn', 'net_worth_declaration', 'investment_experience'],
    broker: ['sec_licence', 'ngx_membership', 'cscs_code', 'nin', 'bvn'],
    fund_manager: ['sec_licence', 'cac_number', 'tin', 'nin', 'bvn'],
    corporate: ['cac_number', 'tin', 'nin', 'bvn'],
    institutional: ['cac_number', 'tin'],
  };

  const requiredFields = fieldsByType[accountType] ?? [];

  async function uploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const form = new FormData(); form.append('file', file);
      const token = localStorage.getItem('aprisys_access');
      const res = await fetch('/api/kyc/upload-document', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      const data = await res.json();
      setDocuments(d => [...d, { ...data, document_label: file.name }]);
    } finally { setUploading(false); }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setSubmitting(true);
    try {
      await apiFetch('/kyc/submit', { method: 'POST', body: JSON.stringify({ entity_type: accountType === 'retail' ? 'individual' : accountType, ...fields, documents }) });
      await refresh(); setDone(true);
    } catch (err: any) { alert(err.message); }
    finally { setSubmitting(false); }
  }

  if (done) return <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center"><div className="card max-w-sm w-full text-center py-8"><CheckCircle size={32} className="text-green-500 mx-auto mb-3" /><h2 className="font-semibold mb-2">KYC submitted</h2><p className="text-sm text-[#888]">We'll review your documents and notify you by email.</p></div></div>;

  return (
    <div className="min-h-screen bg-[#f5f4f0] py-12 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-2.5 mb-8"><div className="w-8 h-8 bg-[#1a1a1a] rounded-lg flex items-center justify-center"><TrendingUp size={16} color="white" /></div><p className="text-sm font-semibold">Aprisys</p></div>
        <div className="card">
          <h1 className="text-xl font-semibold mb-1">Identity verification</h1>
          <p className="text-sm text-[#888] mb-6">Complete KYC to access the deals platform. Account type: <strong className="capitalize">{accountType}</strong></p>
          <form onSubmit={handleSubmit} className="space-y-4">
            {requiredFields.map(f => (
              <div key={f}><label className="label">{f.replace(/_/g, ' ')}</label><input className="input" value={fields[f] ?? ''} onChange={e => setFields(p => ({ ...p, [f]: e.target.value }))} required /></div>
            ))}
            <div>
              <label className="label">Upload documents</label>
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={uploadDoc} disabled={uploading} className="block w-full text-sm text-[#555] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#f0efeb] file:text-sm file:font-medium" />
              {uploading && <p className="text-xs text-[#888] mt-1">Uploading…</p>}
              {documents.map((d, i) => <p key={i} className="text-xs text-green-600 mt-1">✓ {d.filename}</p>)}
            </div>
            <button type="submit" className="btn-primary w-full" disabled={submitting || documents.length === 0}>{submitting ? 'Submitting…' : 'Submit for review'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function KYCPendingPage() {
  return <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center"><div className="card max-w-sm w-full text-center py-8"><div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4"><AlertCircle size={24} className="text-amber-500" /></div><h2 className="font-semibold mb-2">Under review</h2><p className="text-sm text-[#888] mb-4">Your documents are being reviewed. You'll receive an email when complete.</p><Link to="/retail/dashboard" className="btn-secondary w-full">Go to dashboard</Link></div></div>;
}

export function KYCRejectedPage() {
  return <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center"><div className="card max-w-sm w-full text-center py-8"><div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4"><AlertCircle size={24} className="text-red-500" /></div><h2 className="font-semibold mb-2">Verification unsuccessful</h2><p className="text-sm text-[#888] mb-4">Your KYC was not approved. Check your email for the reason and resubmit.</p><Link to="/kyc" className="btn-primary w-full">Resubmit documents</Link></div></div>;
}

export function UpgradeToQualifiedPage() {
  const { refresh } = useAuth();
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  async function handleUpgrade() {
    try { await apiFetch('/auth/upgrade-to-qualified', { method: 'POST' }); await refresh(); setDone(true); setTimeout(() => navigate('/kyc'), 1500); }
    catch (err: any) { alert(err.message); }
  }

  return (
    <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center px-4">
      <div className="card max-w-md w-full">
        <h1 className="text-xl font-semibold mb-2">Access the deals platform</h1>
        <p className="text-sm text-[#888] mb-5">Upgrade your account to Qualified Individual status to participate in deals as an investor. This requires identity verification (NIN, BVN, government ID).</p>
        <div className="bg-[#f8f7f4] rounded-lg p-4 mb-5 text-sm">
          <p className="font-medium mb-2">What you'll get:</p>
          <ul className="space-y-1 text-[#555]">{['Browse deal marketplace', 'Fund escrow as a buyer', 'Participate in T-bills, equity deals, private placements', 'Portfolio tracking'].map(f => <li key={f} className="flex items-center gap-2"><CheckCircle size={13} className="text-green-500" />{f}</li>)}</ul>
        </div>
        {done ? <div className="text-center"><CheckCircle size={24} className="text-green-500 mx-auto mb-2" /><p className="text-sm">Account upgraded. Redirecting to KYC…</p></div>
          : <button onClick={handleUpgrade} className="btn-primary w-full">Upgrade and complete KYC →</button>}
        <Link to="/retail/dashboard" className="block text-center text-xs text-[#888] mt-3 hover:text-[#1a1a1a]">Stay on retail plan</Link>
      </div>
    </div>
  );
}
