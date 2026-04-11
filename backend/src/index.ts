import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

import { runMigration, pool } from './db/client.js';
import { setupWebSocket } from './services/websocket.js';
import { startScheduler } from './services/scheduler.js';

import authRouter from './routes/auth.js';
import dealsRouter from './routes/deals.js';
import webhookRouter from './routes/webhooks.js';
import { escrowRouter } from './routes/escrow.js';
import {
  kycRouter, notificationsRouter, watchlistRouter,
  digestRouter, aiRouter, adminRouter
} from './routes/other.js';

const app = express();
const PORT = parseInt(process.env.PORT ?? '5000');

// ─── Security ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Rate limiting ───────────────────────────────────────────────────────────
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many attempts. Try again in 15 minutes.' } });
const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, message: { error: 'AI rate limit reached. Please wait.' } });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });

// ─── Webhook route (needs raw body for HMAC) ─────────────────────────────────
app.use('/webhooks', express.raw({ type: 'application/json' }), webhookRouter);

// ─── Body parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/auth', authLimiter, authRouter);
app.use('/kyc', apiLimiter, kycRouter);
app.use('/deals', apiLimiter, dealsRouter);
app.use('/escrow', apiLimiter, escrowRouter);
app.use('/notifications', apiLimiter, notificationsRouter);
app.use('/watchlist', apiLimiter, watchlistRouter);
app.use('/digest', apiLimiter, digestRouter);
app.use('/ai', aiLimiter, aiRouter);
app.use('/admin', apiLimiter, adminRouter);

// ─── Preferences ─────────────────────────────────────────────────────────────
app.get('/preferences', async (req, res) => {
  const { requireAuth } = await import('./middleware/auth.js');
  requireAuth(req as any, res, async () => {
    const { queryOne } = await import('./db/client.js');
    const prefs = await queryOne('SELECT * FROM digest.preferences WHERE subscriber_id=$1', [(req as any).subscriber.id]);
    res.json(prefs);
  });
});

app.put('/preferences', async (req, res) => {
  const { requireAuth } = await import('./middleware/auth.js');
  requireAuth(req as any, res, async () => {
    const { query } = await import('./db/client.js');
    const sub = (req as any).subscriber;
    const { delivery_time, frequency, channels, signal_types, sms_hours_start, sms_hours_end } = req.body;
    const allowedChannels = Array.isArray(channels)
      ? channels.filter((c: string) => sub.plan === 'pro' ? true : c !== 'sms')
      : undefined;
    await query(
      `UPDATE digest.preferences SET delivery_time=COALESCE($1,delivery_time), frequency=COALESCE($2,frequency),
       channels=COALESCE($3,channels), signal_types=COALESCE($4,signal_types),
       sms_hours_start=COALESCE($5,sms_hours_start), sms_hours_end=COALESCE($6,sms_hours_end), updated_at=NOW()
       WHERE subscriber_id=$7`,
      [delivery_time, frequency, allowedChannels, signal_types, sms_hours_start, sms_hours_end, sub.id]
    );
    const updated = await (await import('./db/client.js')).queryOne('SELECT * FROM digest.preferences WHERE subscriber_id=$1', [sub.id]);
    res.json(updated);
  });
});

app.put('/preferences/profile', async (req, res) => {
  const { requireAuth } = await import('./middleware/auth.js');
  requireAuth(req as any, res, async () => {
    const { query } = await import('./db/client.js');
    const { name, phone } = req.body;
    const updated = await query(
      `UPDATE digest.subscribers SET name=COALESCE($1,name), phone=COALESCE($2,phone), updated_at=NOW()
       WHERE id=$3 RETURNING id,email,name,phone,account_type,created_at`,
      [name, phone, (req as any).subscriber.id]
    );
    res.json(updated[0]);
  });
});

app.post('/preferences/delete-account', async (req, res) => {
  const { requireAuth } = await import('./middleware/auth.js');
  requireAuth(req as any, res, async () => {
    const { query } = await import('./db/client.js');
    const sub = (req as any).subscriber;
    const { logEvent } = await import('./services/audit.js');
    await logEvent('account.deleted', sub.id, sub.email, 'subscriber', sub.id, { reason: 'user_request' }, req);
    await query('DELETE FROM digest.subscribers WHERE id=$1', [sub.id]);
    res.json({ message: 'Account and all associated data permanently deleted (NDPR erasure complete).' });
  });
});

// Subscriptions
app.get('/subscriptions/me', async (req, res) => {
  const { requireAuth } = await import('./middleware/auth.js');
  requireAuth(req as any, res, async () => {
    const { queryOne } = await import('./db/client.js');
    const sub = await queryOne('SELECT * FROM digest.subscriptions WHERE subscriber_id=$1', [(req as any).subscriber.id]);
    res.json(sub);
  });
});

app.post('/subscriptions/checkout', async (req, res) => {
  const { requireAuth } = await import('./middleware/auth.js');
  requireAuth(req as any, res, async () => {
    const { initializeTransaction } = await import('./services/paystack.js');
    const { plan } = req.body;
    const amounts: Record<string, number> = { standard: 250000, pro: 750000, broker: 5000000 };
    const codes: Record<string, string> = {
      standard: process.env.PAYSTACK_STANDARD_PLAN_CODE!,
      pro: process.env.PAYSTACK_PRO_PLAN_CODE!,
      broker: process.env.PAYSTACK_BROKER_PLAN_CODE!,
    };
    if (!amounts[plan]) return res.status(400).json({ error: 'Invalid plan' });
    const sub = (req as any).subscriber;
    const result = await initializeTransaction({
      email: sub.email, amount: amounts[plan], plan: codes[plan],
      metadata: { subscriber_id: sub.id, plan },
      callback_url: `${process.env.FRONTEND_URL}/retail/billing?session=success`,
    });
    res.json(result);
  });
});

app.post('/subscriptions/cancel', async (req, res) => {
  const { requireAuth } = await import('./middleware/auth.js');
  requireAuth(req as any, res, async () => {
    const { queryOne, query } = await import('./db/client.js');
    const { cancelSubscription } = await import('./services/paystack.js');
    const sub = (req as any).subscriber;
    const subscription = await queryOne<{ paystack_sub_code: string; paystack_email_token: string }>(
      'SELECT paystack_sub_code, paystack_email_token FROM digest.subscriptions WHERE subscriber_id=$1', [sub.id]
    );
    if (!subscription?.paystack_sub_code) return res.status(400).json({ error: 'No active subscription' });
    await cancelSubscription(subscription.paystack_sub_code, subscription.paystack_email_token);
    await query(`UPDATE digest.subscriptions SET status='cancelled', updated_at=NOW() WHERE subscriber_id=$1`, [sub.id]);
    res.json({ message: 'Subscription cancelled. Access retained until current period ends.' });
  });
});

// Portfolio
app.get('/portfolio', async (req, res) => {
  const { requireAuth, requireProfessional } = await import('./middleware/auth.js');
  requireAuth(req as any, res, () => {
    requireProfessional(req as any, res, async () => {
      const { query } = await import('./db/client.js');
      const deals = await query(
        `SELECT d.reference, d.title, d.deal_type, d.total_value, d.status, d.created_at, d.updated_at,
                dp.role, dp.commission_pct,
                COALESCE(c.amount, 0) as commission_earned
         FROM cdi.deal_parties dp
         JOIN cdi.deals d ON d.id = dp.deal_id
         LEFT JOIN cdi.commissions c ON c.deal_id = d.id AND c.recipient_id = dp.subscriber_id
         WHERE dp.subscriber_id=$1 AND dp.status='accepted'
         ORDER BY d.updated_at DESC`,
        [(req as any).subscriber.id]
      );
      res.json(deals);
    });
  });
});

// Reputation
app.get('/subscribers/:id/reputation', async (req, res) => {
  const { queryOne } = await import('./db/client.js');
  const rep = await queryOne(
    `SELECT rated_id as subscriber_id, ROUND(AVG(score)::numeric, 1) as avg_score,
            COUNT(*) as total_ratings,
            (SELECT COUNT(DISTINCT deal_id) FROM cdi.deal_parties WHERE subscriber_id=$1 AND status='accepted') as total_deals
     FROM cdi.counterparty_ratings WHERE rated_id=$1 GROUP BY rated_id`,
    [req.params.id]
  );
  res.json(rep ?? { subscriber_id: req.params.id, avg_score: null, total_ratings: 0, total_deals: 0 });
});

// Health check
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString(), db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ─── Frontend static files ───────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ─── 404 + Error handlers ────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message });
});

// ─── Start ───────────────────────────────────────────────────────────────────
const server = createServer(app);
setupWebSocket(server);

server.listen(PORT, async () => {
  console.log(`[Aprisys] API running on port ${PORT} — powered by Cellion One`);

  try {
    await runMigration();
    console.log('[DB] Connected and migrated');
  } catch (err) {
    console.error('[DB] Migration failed:', err);
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production') {
    await startScheduler();
  } else {
    console.log('[Scheduler] Disabled in development. Set NODE_ENV=production to enable.');
  }
});

export default app;
