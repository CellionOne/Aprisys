import { logEvent } from './audit.js';

const KYC_BASE = 'https://cellionone.com/api/v1/kyc';
const KYB_BASE = 'https://cellionone.com/api/v1/kyb';

function getApiKey(): string {
  const key = process.env.CELLION_API_KEY;
  if (!key) throw new Error('CELLION_API_KEY is not configured');
  return key;
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': getApiKey(),
  };
}

async function callApi(method: 'GET' | 'POST', url: string, body?: Record<string, unknown>) {
  const res = await fetch(url, {
    method,
    headers: headers(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Cellion API error ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

export interface VerifyIdResult {
  verified: boolean;
  fullName?: string;
  referenceId?: string;
}

export async function verifyBVN(
  idNumber: string,
  firstName: string,
  lastName: string,
  dateOfBirth?: string | null,
  actorId?: string
): Promise<VerifyIdResult> {
  await logEvent('cellion.kyc', actorId ?? null, null, 'kyc', null, { action: 'verifyBVN', idNumber: idNumber.slice(0, 4) + '****' });
  try {
    const data = await callApi('POST', `${KYC_BASE}/lookup/bvn`, {
      idNumber, firstName, lastName, ...(dateOfBirth ? { dateOfBirth } : {}),
    });
    return {
      verified: !!(data.verified ?? data.status === 'verified'),
      fullName: data.fullName as string | undefined,
      referenceId: data.referenceId as string | undefined,
    };
  } catch (err) {
    console.error('[Cellion] BVN verification error:', err);
    return { verified: false };
  }
}

export async function verifyNIN(
  idNumber: string,
  firstName: string,
  lastName: string,
  dateOfBirth?: string | null,
  actorId?: string
): Promise<VerifyIdResult> {
  await logEvent('cellion.kyc', actorId ?? null, null, 'kyc', null, { action: 'verifyNIN', idNumber: idNumber.slice(0, 4) + '****' });
  try {
    const data = await callApi('POST', `${KYC_BASE}/lookup/nin`, {
      idNumber, firstName, lastName, ...(dateOfBirth ? { dateOfBirth } : {}),
    });
    return {
      verified: !!(data.verified ?? data.status === 'verified'),
      fullName: data.fullName as string | undefined,
      referenceId: data.referenceId as string | undefined,
    };
  } catch (err) {
    console.error('[Cellion] NIN verification error:', err);
    return { verified: false };
  }
}

export interface KYCSessionResult {
  requestId: string;
  inviteUrl: string;
}

export async function createKYCSession(
  subjectEmail: string,
  subjectName: string,
  subjectPhone?: string | null,
  templateId?: string,
  actorId?: string
): Promise<KYCSessionResult> {
  await logEvent('cellion.kyc', actorId ?? null, subjectEmail, 'kyc', null, { action: 'createKYCSession' });
  const data = await callApi('POST', `${KYC_BASE}/requests`, {
    subjectEmail, subjectName,
    ...(subjectPhone ? { subjectPhone } : {}),
    ...(templateId ? { templateId } : {}),
  });
  return {
    requestId: data.requestId as string,
    inviteUrl: data.inviteUrl as string,
  };
}

export async function getKYCSession(requestId: string): Promise<Record<string, unknown>> {
  await logEvent('cellion.kyc', null, null, 'kyc', null, { action: 'getKYCSession', requestId });
  return callApi('GET', `${KYC_BASE}/requests/${requestId}`);
}

export interface CACResult {
  status: string;
  companyName?: string;
  companyStatus?: string;
  directors?: unknown[];
  reference?: string;
}

export async function verifyCAC(
  rcNumber: string,
  businessType?: string | null,
  actorId?: string
): Promise<CACResult> {
  await logEvent('cellion.kyb', actorId ?? null, null, 'kyb', null, { action: 'verifyCAC', rcNumber });
  try {
    const data = await callApi('POST', `${KYB_BASE}/lookup`, {
      rcNumber, ...(businessType ? { businessType } : {}),
    });
    return {
      status: data.status as string ?? 'unknown',
      companyName: data.companyName as string | undefined,
      companyStatus: data.companyStatus as string | undefined,
      directors: data.directors as unknown[] | undefined,
      reference: data.reference as string | undefined,
    };
  } catch (err) {
    console.error('[Cellion] CAC verification error:', err);
    return { status: 'error' };
  }
}
