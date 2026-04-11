import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { body, validationResult } from 'express-validator';
import { query, queryOne } from '../db/client.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email.js';
import { logEvent } from '../services/audit.js';
import { requireAuth } from '../middleware/auth.js';
import { Subscriber } from '../types/index.js';

const router = Router();

function signAccess(id: string, email: string) {
  return jwt.sign({ sub: id, email }, process.env.JWT_SECRET!, { expiresIn: '15m' });
}

function signRefresh(id: string) {
  return jwt.sign({ sub: id }, process.env.REFRESH_TOKEN_SECRET!, { expiresIn: '7d' });
}

async function storeRefreshToken(subscriber_id: string, token: string) {
  const hashed = await bcrypt.hash(token, 10);
  const expires = new Date(Date.now() + 7 * 24 * 3600_000);
  await query(
    `UPDATE digest.subscribers SET refresh_token=$1, refresh_token_expires=$2 WHERE id=$3`,
    [hashed, expires, subscriber_id]
  );
}

// POST /auth/register
router.post('/register',
  body('email').isEmail().normalizeEmail(),
  body('name').trim().notEmpty().isLength({ min: 2, max: 80 }),
  body('password').isLength({ min: 8 }),
  body('consent').equals('true').withMessage('NDPR consent required'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { email, name, password, phone, account_type = 'retail' } = req.body;
      const existing = await queryOne('SELECT id FROM digest.subscribers WHERE email=$1', [email]);
      if (existing) return res.status(409).json({ error: 'Email already registered' });

      const password_hash = await bcrypt.hash(password, 12);
      const verify_token = uuidv4();

      const [sub] = await query<Subscriber>(
        `INSERT INTO digest.subscribers (email, name, phone, password_hash, verify_token, account_type)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [email, name, phone ?? null, password_hash, verify_token, account_type]
      );

      await query(`INSERT INTO digest.subscriptions (subscriber_id) VALUES ($1)`, [sub.id]);
      await query(`INSERT INTO digest.preferences (subscriber_id) VALUES ($1)`, [sub.id]);
      await query(`INSERT INTO digest.kyc_records (subscriber_id, entity_type) VALUES ($1,$2)`,
        [sub.id, account_type === 'retail' ? 'individual' : account_type]);

      try {
        await sendVerificationEmail(email, name, verify_token);
      } catch (emailErr) {
        console.error('[Auth] Verification email failed (non-fatal):', emailErr);
      }
      await logEvent('auth.register', sub.id, email, 'subscriber', sub.id, { account_type }, req);

      res.status(201).json({ message: 'Registration successful. Please verify your email.' });
    } catch (err) {
      console.error('[Auth] Register error:', err);
      res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  }
);

// POST /auth/login
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { email, password } = req.body;
      const sub = await queryOne<Subscriber & { password_hash: string; plan: string; subscription_status: string }>(
        `SELECT s.*, sub.plan, sub.status as subscription_status
         FROM digest.subscribers s LEFT JOIN digest.subscriptions sub ON sub.subscriber_id = s.id
         WHERE s.email=$1`, [email]
      );

      if (!sub || !sub.password_hash) return res.status(401).json({ error: 'Invalid credentials' });

      if (sub.account_status === 'suspended') {
        return res.status(403).json({ error: 'Account suspended', reason: sub.suspension_reason });
      }

      const valid = await bcrypt.compare(password, sub.password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
      if (!sub.email_verified) return res.status(403).json({ error: 'Please verify your email before logging in' });

      const accessToken = signAccess(sub.id, sub.email);
      const refreshToken = signRefresh(sub.id);
      await storeRefreshToken(sub.id, refreshToken);
      await logEvent('auth.login', sub.id, email, 'subscriber', sub.id, {}, req);

      const { password_hash, verify_token, reset_token, reset_expires, refresh_token, ...safe } = sub as any;
      res.json({ accessToken, refreshToken, subscriber: safe });
    } catch (err) {
      console.error('[Auth] Login error:', err);
      res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  }
);

// POST /auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

  try {
    const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!) as { sub: string };
    const sub = await queryOne<{ id: string; email: string; refresh_token: string; refresh_token_expires: string; account_status: string }>(
      'SELECT id, email, refresh_token, refresh_token_expires, account_status FROM digest.subscribers WHERE id=$1',
      [payload.sub]
    );

    if (!sub || !sub.refresh_token) return res.status(401).json({ error: 'Invalid refresh token' });
    if (new Date(sub.refresh_token_expires) < new Date()) return res.status(401).json({ error: 'Refresh token expired' });
    if (sub.account_status !== 'active') return res.status(403).json({ error: 'Account suspended' });

    const valid = await bcrypt.compare(refreshToken, sub.refresh_token);
    if (!valid) return res.status(401).json({ error: 'Invalid refresh token' });

    const newAccessToken = signAccess(sub.id, sub.email);
    const newRefreshToken = signRefresh(sub.id);
    await storeRefreshToken(sub.id, newRefreshToken);

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// GET /auth/verify-email
router.get('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const sub = await queryOne<Subscriber>(
      `UPDATE digest.subscribers SET email_verified=TRUE, verify_token=NULL, updated_at=NOW()
       WHERE verify_token=$1 RETURNING *`, [token]
    );
    if (!sub) return res.status(400).json({ error: 'Invalid or expired token' });

    const accessToken = signAccess(sub.id, sub.email);
    const refreshToken = signRefresh(sub.id);
    await storeRefreshToken(sub.id, refreshToken);

    res.redirect(`${process.env.FRONTEND_URL}/auth/verified?token=${accessToken}&refresh=${refreshToken}`);
  } catch (err) {
    console.error('[Auth] Verify email error:', err);
    res.status(500).json({ error: 'Email verification failed. Please try again.' });
  }
});

// POST /auth/forgot-password
router.post('/forgot-password', body('email').isEmail().normalizeEmail(), async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const sub = await queryOne<Subscriber>('SELECT * FROM digest.subscribers WHERE email=$1', [email]);
    if (sub) {
      const token = uuidv4();
      const expires = new Date(Date.now() + 3600_000);
      await query(`UPDATE digest.subscribers SET reset_token=$1, reset_expires=$2 WHERE id=$3`, [token, expires, sub.id]);
      try {
        await sendPasswordResetEmail(email, sub.name, token);
      } catch (emailErr) {
        console.error('[Auth] Password reset email failed (non-fatal):', emailErr);
      }
    }
    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    console.error('[Auth] Forgot password error:', err);
    res.status(500).json({ error: 'Request failed. Please try again.' });
  }
});

// POST /auth/reset-password
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    const sub = await queryOne<Subscriber>(
      `SELECT * FROM digest.subscribers WHERE reset_token=$1 AND reset_expires > NOW()`, [token]
    );
    if (!sub) return res.status(400).json({ error: 'Invalid or expired reset token' });
    const hash = await bcrypt.hash(password, 12);
    await query(`UPDATE digest.subscribers SET password_hash=$1, reset_token=NULL, reset_expires=NULL WHERE id=$2`, [hash, sub.id]);
    res.json({ message: 'Password updated. You can now log in.' });
  } catch (err) {
    console.error('[Auth] Reset password error:', err);
    res.status(500).json({ error: 'Password reset failed. Please try again.' });
  }
});

// POST /auth/logout
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  try {
    await query(`UPDATE digest.subscribers SET refresh_token=NULL, refresh_token_expires=NULL WHERE id=$1`, [req.subscriber!.id]);
    await logEvent('auth.logout', req.subscriber!.id, req.subscriber!.email, 'subscriber', req.subscriber!.id, {}, req);
    res.json({ message: 'Logged out' });
  } catch (err) {
    console.error('[Auth] Logout error:', err);
    res.status(500).json({ error: 'Logout failed. Please try again.' });
  }
});

// GET /auth/me
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  res.json(req.subscriber);
});

// POST /auth/upgrade-to-qualified
router.post('/upgrade-to-qualified', requireAuth, async (req: Request, res: Response) => {
  const sub = req.subscriber!;
  if (sub.account_type !== 'retail') {
    return res.status(400).json({ error: 'Only retail accounts can upgrade to qualified individual' });
  }
  await query(
    `UPDATE digest.subscribers SET account_type='qualified', kyc_status='pending', updated_at=NOW() WHERE id=$1`,
    [sub.id]
  );
  await query(
    `INSERT INTO digest.kyc_records (subscriber_id, entity_type, version)
     VALUES ($1, 'qualified_individual', 1)`,
    [sub.id]
  );
  res.json({ message: 'Account upgraded to Qualified Individual. Complete KYC to access deals.' });
});

// Google OAuth
router.get('/google', (_req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: `${process.env.APP_URL}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req: Request, res: Response) => {
  const { code } = req.query;
  if (!code) return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_failed`);

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code as string, client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        redirect_uri: `${process.env.APP_URL}/auth/google/callback`, grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json() as { access_token: string };
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const gUser = await userRes.json() as { id: string; email: string; name: string };

    let sub = await queryOne<Subscriber>('SELECT * FROM digest.subscribers WHERE google_id=$1 OR email=$2', [gUser.id, gUser.email]);
    if (!sub) {
      const [newSub] = await query<Subscriber>(
        `INSERT INTO digest.subscribers (email, name, google_id, email_verified) VALUES ($1,$2,$3,TRUE) RETURNING *`,
        [gUser.email, gUser.name, gUser.id]
      );
      sub = newSub;
      await query(`INSERT INTO digest.subscriptions (subscriber_id) VALUES ($1)`, [sub.id]);
      await query(`INSERT INTO digest.preferences (subscriber_id) VALUES ($1)`, [sub.id]);
    }

    const accessToken = signAccess(sub.id, sub.email);
    const refreshToken = signRefresh(sub.id);
    await storeRefreshToken(sub.id, refreshToken);
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${accessToken}&refresh=${refreshToken}`);
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=google_failed`);
  }
});

export default router;
