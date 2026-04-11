import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

const API = '/api';

export type AccountType = 'retail' | 'qualified' | 'broker' | 'fund_manager' | 'corporate' | 'institutional' | 'admin';
export type Plan = 'free' | 'standard' | 'pro' | 'broker' | 'institutional';

export interface Subscriber {
  id: string; email: string; name: string; phone?: string;
  account_type: AccountType; kyc_status: string; account_status: string;
  is_admin: boolean; plan: Plan; subscription_status: string; created_at: string;
}

interface AuthCtx {
  subscriber: Subscriber | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  isProfessional: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [subscriber, setSubscriber] = useState<Subscriber | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem('aprisys_access'));
  const [loading, setLoading] = useState(true);

  const refreshTokens = useCallback(async (): Promise<string | null> => {
    const refreshToken = localStorage.getItem('aprisys_refresh');
    if (!refreshToken) return null;
    try {
      const res = await fetch(`${API}/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) { localStorage.removeItem('aprisys_refresh'); return null; }
      const data = await res.json() as { accessToken: string; refreshToken: string };
      localStorage.setItem('aprisys_access', data.accessToken);
      localStorage.setItem('aprisys_refresh', data.refreshToken);
      setAccessToken(data.accessToken);
      return data.accessToken;
    } catch { return null; }
  }, []);

  async function loadSubscriber(token: string) {
    const res = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      const newToken = await refreshTokens();
      if (!newToken) { clearAuth(); return; }
      const res2 = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${newToken}` } });
      if (!res2.ok) { clearAuth(); return; }
      const data = await res2.json() as Subscriber;
      setSubscriber(data);
      return;
    }
    if (!res.ok) { clearAuth(); return; }
    const data = await res.json() as Subscriber;
    setSubscriber(data);
  }

  function clearAuth() {
    localStorage.removeItem('aprisys_access');
    localStorage.removeItem('aprisys_refresh');
    setAccessToken(null);
    setSubscriber(null);
  }

  useEffect(() => {
    if (accessToken) {
      loadSubscriber(accessToken).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  async function login(email: string, password: string) {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json() as { accessToken: string; refreshToken: string; subscriber: Subscriber; error?: string };
    if (!res.ok) throw new Error(data.error ?? 'Login failed');
    localStorage.setItem('aprisys_access', data.accessToken);
    localStorage.setItem('aprisys_refresh', data.refreshToken);
    setAccessToken(data.accessToken);
    setSubscriber(data.subscriber);
  }

  function logout() {
    if (accessToken) {
      fetch(`${API}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => {});
    }
    clearAuth();
  }

  async function refresh() {
    if (accessToken) await loadSubscriber(accessToken);
  }

  const PROFESSIONAL_TYPES: AccountType[] = ['qualified', 'broker', 'fund_manager', 'corporate', 'institutional', 'admin'];
  const isProfessional = PROFESSIONAL_TYPES.includes(subscriber?.account_type ?? 'retail');
  const isAdmin = subscriber?.is_admin ?? false;

  return (
    <AuthContext.Provider value={{ subscriber, accessToken, loading, login, logout, refresh, isProfessional, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

// API helper with auto-refresh
export async function apiFetch<T>(path: string, options: RequestInit & { skipAuth?: boolean } = {}): Promise<T> {
  const token = localStorage.getItem('aprisys_access');
  const { skipAuth, ...rest } = options;

  async function doFetch(t: string | null): Promise<Response> {
    return fetch(`${API}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(t && !skipAuth ? { Authorization: `Bearer ${t}` } : {}),
        ...(rest.headers ?? {}),
      },
    });
  }

  let res = await doFetch(token);

  // Auto-refresh on 401
  if (res.status === 401 && !skipAuth) {
    const refreshToken = localStorage.getItem('aprisys_refresh');
    if (refreshToken) {
      const refreshRes = await fetch(`${API}/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (refreshRes.ok) {
        const tokens = await refreshRes.json() as { accessToken: string; refreshToken: string };
        localStorage.setItem('aprisys_access', tokens.accessToken);
        localStorage.setItem('aprisys_refresh', tokens.refreshToken);
        res = await doFetch(tokens.accessToken);
      }
    }
  }

  const data = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
  return data;
}
