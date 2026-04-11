import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { queryOne } from '../db/client.js';
import { Subscriber, Plan, SubscriptionStatus, AccountType } from '../types/index.js';

interface JwtPayload { sub: string; email: string; iat: number; exp: number; }

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorised' });

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    const row = await queryOne<Subscriber & { plan: Plan; subscription_status: SubscriptionStatus }>(
      `SELECT s.*, sub.plan, sub.status as subscription_status
       FROM digest.subscribers s
       LEFT JOIN digest.subscriptions sub ON sub.subscriber_id = s.id
       WHERE s.id = $1 AND s.account_status = 'active'`,
      [payload.sub]
    );
    if (!row) return res.status(401).json({ error: 'Subscriber not found or account suspended' });
    req.subscriber = row;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.subscriber?.is_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
}

export function requireVerifiedKyc(req: Request, res: Response, next: NextFunction) {
  const sub = req.subscriber!;
  const professionalTypes: AccountType[] = ['qualified', 'broker', 'fund_manager', 'corporate', 'institutional'];
  if (professionalTypes.includes(sub.account_type) && sub.kyc_status !== 'verified') {
    return res.status(403).json({
      error: 'KYC verification required',
      kyc_status: sub.kyc_status,
      message: sub.kyc_status === 'pending' ? 'Please complete KYC to access this feature' :
                sub.kyc_status === 'submitted' ? 'Your KYC is under review. Please check back soon.' :
                sub.kyc_status === 'rejected' ? 'Your KYC was rejected. Please resubmit your documents.' :
                'KYC verification required'
    });
  }
  next();
}

export function requireProfessional(req: Request, res: Response, next: NextFunction) {
  const professionalTypes: AccountType[] = ['qualified', 'broker', 'fund_manager', 'corporate', 'institutional', 'admin'];
  if (!professionalTypes.includes(req.subscriber!.account_type)) {
    return res.status(403).json({
      error: 'Professional account required',
      message: 'Upgrade to a professional account to access deals.',
      current_type: req.subscriber!.account_type
    });
  }
  next();
}

export function requirePlan(...plans: Plan[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const planRank: Record<Plan, number> = { free: 0, standard: 1, pro: 2, broker: 3, institutional: 4 };
    const userPlan = req.subscriber?.plan ?? 'free';
    const minRequired = Math.min(...plans.map(p => planRank[p]));
    if (planRank[userPlan] < minRequired) {
      return res.status(403).json({ error: 'Upgrade required', required: plans[0], current: userPlan });
    }
    next();
  };
}
