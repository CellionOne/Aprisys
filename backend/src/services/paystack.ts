const BASE = 'https://api.paystack.co';

async function paystackFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json() as { status: boolean; message: string; data: T };
  if (!data.status) throw new Error(`Paystack: ${data.message}`);
  return data.data;
}

export async function initializeTransaction(payload: {
  email: string; amount: number; plan?: string;
  metadata?: Record<string, unknown>; callback_url?: string;
}) {
  return paystackFetch<{ authorization_url: string; reference: string }>('/transaction/initialize', {
    method: 'POST', body: JSON.stringify(payload),
  });
}

export async function verifyTransaction(reference: string) {
  return paystackFetch<Record<string, unknown>>(`/transaction/verify/${reference}`);
}

export async function cancelSubscription(sub_code: string, email_token: string) {
  return paystackFetch('/subscription/disable', {
    method: 'POST', body: JSON.stringify({ code: sub_code, token: email_token }),
  });
}
