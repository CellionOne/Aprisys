import { Router, Request, Response } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth, requireAdmin, requireProfessional } from '../middleware/auth.js';
import { query, queryOne } from '../db/client.js';
import { logEvent } from '../services/audit.js';
import { createNotification } from '../services/notifications.js';
import { uploadFile, downloadFile, buildStorageKey } from '../services/storage.js';
import { sendKycSubmittedEmail, sendKycApprovedEmail, sendKycRejectedEmail, sendAccountSuspendedEmail, sendKycBiometricInviteEmail } from '../services/email.js';
import { verifyBVN, verifyNIN, verifyCAC, createKYCSession } from '../services/cellionService.js';
import { getDealStructure, generateTermSheet, scoreDealRisk, matchCounterparties, summariseDealRoom, analyseDocument, getMarketContext, getNegotiationSuggestion } from '../services/aiService.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── KYC ─────────────────────────────────────────────────────────────────────
export const kycRouter = Router();

kycRouter.post('/upload-document', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
  if (!allowed.includes(req.file.mimetype)) return res.status(400).json({ error: 'Only PDF, PNG, JPG files allowed' });

  const key = buildStorageKey('kyc', req.subscriber!.id, req.file.originalname);
  await uploadFile(key, req.file.buffer, req.file.mimetype);

  res.json({ storage_key: key, filename: req.file.originalname, file_size: req.file.size, mime_type: req.file.mimetype });
});

kycRouter.post('/submit', requireAuth, async (req: Request, res: Response) => {
  const { entity_type, nin, bvn, cac_number, tin, sec_licence, ngx_membership, cscs_code,
          net_worth_declaration, investment_experience, date_of_birth, documents = [] } = req.body;

  const sub = req.subscriber!;
  const nameParts = sub.name.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ') || nameParts[0];

  const existing = await queryOne<{ id: string; version: number }>(
    'SELECT id, version FROM digest.kyc_records WHERE subscriber_id=$1 ORDER BY version DESC LIMIT 1',
    [sub.id]
  );

  let kycId: string;
  if (existing) {
    await query(
      `UPDATE digest.kyc_records SET entity_type=$1, nin=$2, bvn=$3, cac_number=$4, tin=$5, sec_licence=$6,
       ngx_membership=$7, cscs_code=$8, net_worth_declaration=$9, investment_experience=$10,
       documents=$11, status='submitted', submitted_at=NOW(), review_notes=NULL, rejection_reason=NULL WHERE id=$12`,
      [entity_type, nin, bvn, cac_number, tin, sec_licence, ngx_membership, cscs_code,
       net_worth_declaration, investment_experience, JSON.stringify(documents), existing.id]
    );
    kycId = existing.id;
  } else {
    const [inserted] = await query<{ id: string }>(
      `INSERT INTO digest.kyc_records (subscriber_id, entity_type, nin, bvn, cac_number, tin, sec_licence,
       ngx_membership, cscs_code, net_worth_declaration, investment_experience, documents, status, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'submitted',NOW()) RETURNING id`,
      [sub.id, entity_type, nin, bvn, cac_number, tin, sec_licence, ngx_membership, cscs_code,
       net_worth_declaration, investment_experience, JSON.stringify(documents)]
    );
    kycId = inserted.id;
  }

  await query(`UPDATE digest.subscribers SET kyc_status='submitted' WHERE id=$1`, [sub.id]);
  await logEvent('kyc.submitted', sub.id, sub.email, 'kyc', kycId, { entity_type }, req);

  // ─── Cellion auto-verification ────────────────────────────────────────────
  const isCellionEnabled = !!process.env.CELLION_API_KEY;
  if (!isCellionEnabled) {
    console.log('[KYC] CELLION_API_KEY not set — skipping auto-verification for', sub.email);
    await sendKycSubmittedEmail(sub.email, sub.name, entity_type);
    return res.json({ message: 'KYC submitted for review' });
  }

  try {
    if (['individual', 'qualified_individual'].includes(entity_type)) {
      // BVN + NIN auto-verify
      const [bvnResult, ninResult] = await Promise.all([
        bvn ? verifyBVN(bvn, firstName, lastName, date_of_birth, sub.id) : Promise.resolve({ verified: false }),
        nin ? verifyNIN(nin, firstName, lastName, date_of_birth, sub.id) : Promise.resolve({ verified: false }),
      ]);

      if (bvnResult.verified && ninResult.verified) {
        await query(
          `UPDATE digest.kyc_records SET status='verified', verified_at=NOW(),
           review_notes='Auto-verified via Cellion BVN/NIN check' WHERE id=$1`,
          [kycId]
        );
        await query(`UPDATE digest.subscribers SET kyc_status='verified' WHERE id=$1`, [sub.id]);
        try { await sendKycApprovedEmail(sub.email, sub.name, sub.account_type); } catch (_) {}
        await createNotification(sub.id, 'kyc_approved', 'Account verified',
          'Your identity has been automatically verified. You can now access your account features.', 'kyc', kycId);
        await logEvent('kyc.auto_verified', sub.id, sub.email, 'kyc', kycId, { method: 'bvn_nin', entity_type }, req);
        return res.json({ message: 'KYC submitted and automatically verified' });
      } else {
        const note = `auto_verify_failed: BVN=${bvnResult.verified}, NIN=${ninResult.verified}`;
        await query(`UPDATE digest.kyc_records SET review_notes=$1 WHERE id=$2`, [note, kycId]);
        try { await sendKycSubmittedEmail(sub.email, sub.name, entity_type); } catch (_) {}
        return res.json({ message: 'KYC submitted for review' });
      }
    }

    if (['corporate', 'institutional'].includes(entity_type)) {
      // CAC auto-verify
      const cacResult = await verifyCAC(cac_number, entity_type, sub.id);
      const cacIsActive = cacResult.companyStatus?.toUpperCase() === 'ACTIVE';

      const cacDocEntry = {
        document_label: 'CAC Registry Verification',
        verified_at: new Date().toISOString(),
        data: cacResult,
      };
      const currentDocs = documents as unknown[];
      const updatedDocs = [...currentDocs, cacDocEntry];
      await query(`UPDATE digest.kyc_records SET documents=$1 WHERE id=$2`, [JSON.stringify(updatedDocs), kycId]);

      if (cacIsActive) {
        await query(
          `UPDATE digest.kyc_records SET status='verified', verified_at=NOW(),
           review_notes='Auto-verified via Cellion CAC lookup' WHERE id=$1`,
          [kycId]
        );
        await query(`UPDATE digest.subscribers SET kyc_status='verified' WHERE id=$1`, [sub.id]);
        try { await sendKycApprovedEmail(sub.email, sub.name, sub.account_type); } catch (_) {}
        await createNotification(sub.id, 'kyc_approved', 'Business verified',
          'Your company has been verified. You can now access the platform.', 'kyc', kycId);
        await logEvent('kyc.auto_verified', sub.id, sub.email, 'kyc', kycId, { method: 'cac', entity_type, companyStatus: cacResult.companyStatus }, req);
        return res.json({ message: 'KYC submitted and business automatically verified' });
      } else {
        const note = `auto_verify_failed: CAC status=${cacResult.companyStatus ?? 'unknown'}`;
        await query(`UPDATE digest.kyc_records SET review_notes=$1 WHERE id=$2`, [note, kycId]);
        try { await sendKycSubmittedEmail(sub.email, sub.name, entity_type); } catch (_) {}
        return res.json({ message: 'KYC submitted for review' });
      }
    }

    if (['stockbroker', 'fund_manager'].includes(entity_type)) {
      // BVN + NIN, then create biometric session
      const [bvnResult, ninResult] = await Promise.all([
        bvn ? verifyBVN(bvn, firstName, lastName, date_of_birth, sub.id) : Promise.resolve({ verified: false }),
        nin ? verifyNIN(nin, firstName, lastName, date_of_birth, sub.id) : Promise.resolve({ verified: false }),
      ]);

      if (bvnResult.verified && ninResult.verified) {
        try {
          const session = await createKYCSession(sub.email, sub.name, sub.phone ?? undefined, undefined, sub.id);
          const note = `biometric_session_created: requestId=${session.requestId}`;
          await query(`UPDATE digest.kyc_records SET review_notes=$1 WHERE id=$2`, [note, kycId]);
          try { await sendKycBiometricInviteEmail(sub.email, sub.name, session.inviteUrl); } catch (_) {}
          await logEvent('kyc.biometric_session_created', sub.id, sub.email, 'kyc', kycId,
            { requestId: session.requestId, entity_type }, req);
        } catch (sessionErr) {
          console.error('[KYC] Failed to create biometric session:', sessionErr);
          const note = `auto_verify_partial: BVN/NIN passed but biometric session creation failed`;
          await query(`UPDATE digest.kyc_records SET review_notes=$1 WHERE id=$2`, [note, kycId]);
        }
      } else {
        const note = `auto_verify_failed: BVN=${bvnResult.verified}, NIN=${ninResult.verified}`;
        await query(`UPDATE digest.kyc_records SET review_notes=$1 WHERE id=$2`, [note, kycId]);
      }
      try { await sendKycSubmittedEmail(sub.email, sub.name, entity_type); } catch (_) {}
      return res.json({ message: 'KYC submitted for review' });
    }

    // Default — no auto-verify for this type
    await sendKycSubmittedEmail(sub.email, sub.name, entity_type);
    res.json({ message: 'KYC submitted for review' });

  } catch (autoVerifyErr) {
    console.error('[KYC] Auto-verification error (non-fatal):', autoVerifyErr);
    try { await sendKycSubmittedEmail(sub.email, sub.name, entity_type); } catch (_) {}
    res.json({ message: 'KYC submitted for review' });
  }
});

kycRouter.put('/resubmit', requireAuth, async (req: Request, res: Response) => {
  const current = await queryOne<{ id: string; version: number; status: string }>('SELECT id, version, status FROM digest.kyc_records WHERE subscriber_id=$1 ORDER BY version DESC LIMIT 1', [req.subscriber!.id]);
  if (!current || current.status !== 'rejected') return res.status(400).json({ error: 'Can only resubmit after rejection' });

  const { entity_type, nin, bvn, cac_number, tin, sec_licence, ngx_membership, cscs_code, net_worth_declaration, investment_experience, documents = [] } = req.body;

  await query(
    `INSERT INTO digest.kyc_records (subscriber_id, entity_type, version, nin, bvn, cac_number, tin, sec_licence, ngx_membership, cscs_code, net_worth_declaration, investment_experience, documents, status, submitted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'submitted',NOW())`,
    [req.subscriber!.id, entity_type, current.version + 1, nin, bvn, cac_number, tin, sec_licence, ngx_membership, cscs_code, net_worth_declaration, investment_experience, JSON.stringify(documents)]
  );

  await query(`UPDATE digest.subscribers SET kyc_status='submitted' WHERE id=$1`, [req.subscriber!.id]);
  await logEvent('kyc.resubmitted', req.subscriber!.id, req.subscriber!.email, 'kyc', req.subscriber!.id, {}, req);
  res.json({ message: 'KYC resubmitted' });
});

kycRouter.get('/status', requireAuth, async (req: Request, res: Response) => {
  const kyc = await queryOne('SELECT * FROM digest.kyc_records WHERE subscriber_id=$1 ORDER BY version DESC LIMIT 1', [req.subscriber!.id]);
  res.json(kyc ?? { status: 'not_submitted' });
});

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
export const notificationsRouter = Router();

notificationsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const notifications = await query(
    `SELECT * FROM digest.notifications WHERE subscriber_id=$1 ORDER BY created_at DESC LIMIT 20`,
    [req.subscriber!.id]
  );
  const unread = await queryOne<{ count: string }>(
    'SELECT COUNT(*) as count FROM digest.notifications WHERE subscriber_id=$1 AND read_at IS NULL',
    [req.subscriber!.id]
  );
  res.json({ notifications, unread_count: parseInt(unread?.count ?? '0') });
});

notificationsRouter.post('/mark-read', requireAuth, async (req: Request, res: Response) => {
  const { notification_ids, mark_all } = req.body;
  if (mark_all) {
    await query(`UPDATE digest.notifications SET read_at=NOW() WHERE subscriber_id=$1 AND read_at IS NULL`, [req.subscriber!.id]);
  } else if (Array.isArray(notification_ids)) {
    await query(`UPDATE digest.notifications SET read_at=NOW() WHERE id=ANY($1) AND subscriber_id=$2`, [notification_ids, req.subscriber!.id]);
  }
  res.json({ message: 'Marked as read' });
});

// ─── WATCHLIST ────────────────────────────────────────────────────────────────
export const watchlistRouter = Router();

watchlistRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const items = await query(
    `SELECT w.ticker, w.added_at, s.name as company_name, s.sector,
            sc.ias, sc.rs, sc.cs,
            p.close, ROUND(((p.close - prev.close) / NULLIF(prev.close,0) * 100)::numeric, 2) as change_pct
     FROM digest.watchlists w
     LEFT JOIN public.cie_securities s ON s.ticker = w.ticker
     LEFT JOIN LATERAL (SELECT ias,rs,cs FROM public.cie_scores WHERE ticker=w.ticker ORDER BY score_date DESC LIMIT 1) sc ON TRUE
     LEFT JOIN LATERAL (SELECT close FROM public.cie_daily_prices WHERE ticker=w.ticker ORDER BY trade_date DESC LIMIT 1) p ON TRUE
     LEFT JOIN LATERAL (SELECT close FROM public.cie_daily_prices WHERE ticker=w.ticker ORDER BY trade_date DESC LIMIT 1 OFFSET 1) prev ON TRUE
     WHERE w.subscriber_id=$1 ORDER BY w.added_at DESC`,
    [req.subscriber!.id]
  );
  res.json(items);
});

watchlistRouter.get('/search', requireAuth, async (req: Request, res: Response) => {
  const { q } = req.query as { q: string };
  if (!q || q.length < 2) return res.json([]);
  const results = await query(
    `SELECT ticker, name, sector FROM public.cie_securities WHERE (ticker ILIKE $1 OR name ILIKE $1) AND is_active=TRUE ORDER BY ticker LIMIT 20`,
    [`%${q}%`]
  );
  res.json(results);
});

watchlistRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  const { ticker } = req.body;
  if (!ticker) return res.status(400).json({ error: 'Ticker required' });
  const t = ticker.toUpperCase().trim();
  const sec = await queryOne('SELECT ticker FROM public.cie_securities WHERE ticker=$1', [t]);
  if (!sec) return res.status(404).json({ error: `${t} not found in NGX securities` });

  const plan = req.subscriber!.plan;
  if (plan === 'free') {
    const count = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM digest.watchlists WHERE subscriber_id=$1', [req.subscriber!.id]);
    if (parseInt(count?.count ?? '0') >= 5) return res.status(403).json({ error: 'Free plan limited to 5 tickers. Upgrade for unlimited.' });
  }

  await query(`INSERT INTO digest.watchlists (subscriber_id, ticker) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.subscriber!.id, t]);
  res.status(201).json({ ticker: t });
});

watchlistRouter.delete('/:ticker', requireAuth, async (req: Request, res: Response) => {
  await query('DELETE FROM digest.watchlists WHERE subscriber_id=$1 AND ticker=$2', [req.subscriber!.id, req.params.ticker.toUpperCase()]);
  res.json({ message: 'Removed' });
});

// ─── DIGEST ───────────────────────────────────────────────────────────────────
export const digestRouter = Router();

digestRouter.get('/market-pulse', async (_req: Request, res: Response) => {
  const pulse = await queryOne(
    'SELECT * FROM public.cie_market_pulse ORDER BY trade_date DESC LIMIT 1'
  );
  if (!pulse) return res.json(null);
  res.json(pulse);
});

digestRouter.get('/today', requireAuth, async (req: Request, res: Response) => {
  const today = new Date().toISOString().split('T')[0];
  const archive = await queryOne('SELECT * FROM digest.archive WHERE digest_date=$1', [today]);
  if (!archive) return res.json({ message: "Today's digest hasn't been composed yet. Check back after 7:30pm WAT." });

  const plan = req.subscriber!.plan;
  if (plan === 'free') {
    return res.json({
      ...(archive as Record<string, unknown>),
      top_securities: ((archive as any).top_securities ?? []).slice(0, 5),
      signals: [],
      ai_commentary: null,
    });
  }
  res.json(archive);
});

digestRouter.get('/archive', requireAuth, async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = 20;
  const items = await query(
    `SELECT digest_date, composed_at, (market_snapshot->>'asi_change_pct')::float as asi_change_pct, (market_snapshot->>'asi')::float as asi
     FROM digest.archive ORDER BY digest_date DESC LIMIT $1 OFFSET $2`,
    [limit, (page - 1) * limit]
  );
  const total = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM digest.archive');
  res.json({ data: items, pagination: { page, limit, total: parseInt(total?.count ?? '0') } });
});

digestRouter.get('/track/open/:token', async (req: Request, res: Response) => {
  await query(`UPDATE digest.deliveries SET opened_at=NOW(), status='delivered' WHERE open_token=$1 AND opened_at IS NULL`, [req.params.token]);
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.set('Content-Type', 'image/gif').send(pixel);
});

digestRouter.get('/unsubscribe/:token', async (req: Request, res: Response) => {
  const d = await queryOne<{ subscriber_id: string }>('SELECT subscriber_id FROM digest.deliveries WHERE unsub_token=$1', [req.params.token]);
  if (!d) return res.status(400).send('Invalid link');
  await query(`UPDATE digest.deliveries SET unsubscribed_at=NOW() WHERE unsub_token=$1`, [req.params.token]);
  await query(`UPDATE digest.subscriptions SET plan='free' WHERE subscriber_id=$1`, [d.subscriber_id]);
  res.redirect(`${process.env.FRONTEND_URL}/unsubscribed`);
});

digestRouter.get('/:date', requireAuth, async (req: Request, res: Response) => {
  const archive = await queryOne('SELECT * FROM digest.archive WHERE digest_date=$1', [req.params.date]);
  if (!archive) return res.status(404).json({ error: 'Not found' });
  res.json(archive);
});

// ─── AI ROUTES ────────────────────────────────────────────────────────────────
export const aiRouter = Router();
const proMiddleware = [requireAuth, requireProfessional];

aiRouter.post('/deal-structure', ...proMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await getDealStructure(req.body.description, req.subscriber!.id);
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'AI service unavailable' }); }
});

aiRouter.post('/term-sheet', ...proMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await generateTermSheet(req.body.deal_id, req.subscriber!.id);
    res.json({ term_sheet: result });
  } catch (err) { res.status(500).json({ error: 'AI service unavailable' }); }
});

aiRouter.post('/risk-score', ...proMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await scoreDealRisk(req.body.deal_id, req.subscriber!.id);
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'AI service unavailable' }); }
});

aiRouter.post('/match-counterparties', ...proMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await matchCounterparties(req.body.deal_id, req.subscriber!.id);
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'AI service unavailable' }); }
});

aiRouter.post('/summarise-room', ...proMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await summariseDealRoom(req.body.deal_id, req.subscriber!.id);
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'AI service unavailable' }); }
});

aiRouter.post('/analyse-document', ...proMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await analyseDocument(req.body.document_text, req.subscriber!.id);
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'AI service unavailable' }); }
});

aiRouter.post('/market-context', ...proMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await getMarketContext(req.body.ticker, req.subscriber!.id);
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'AI service unavailable' }); }
});

aiRouter.post('/negotiation-suggest', ...proMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await getNegotiationSuggestion(req.body.deal_id, req.body.latest_message, req.subscriber!.id);
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'AI service unavailable' }); }
});

const _getAnthropicClient = (() => {
  let client: Anthropic | null = null;
  return () => {
    if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return client;
  };
})();

async function callClaudeDoc(system: string, userContent: string, maxTokens = 4096): Promise<string> {
  const response = await _getAnthropicClient().messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userContent }],
  });
  const content = response.content[0];
  return content.type === 'text' ? content.text : '';
}

async function assertDealAccess(deal_id: string, subscriber_id: string, is_admin: boolean): Promise<boolean> {
  if (is_admin) return true;
  const party = await queryOne(
    `SELECT id FROM cdi.deal_parties WHERE deal_id=$1 AND subscriber_id=$2 AND status='accepted'`,
    [deal_id, subscriber_id]
  );
  return !!party;
}

// POST /ai/generate-letter-of-offer
aiRouter.post('/generate-letter-of-offer', ...proMiddleware, async (req: Request, res: Response) => {
  try {
    const { deal_id } = req.body;
    if (!deal_id) return res.status(400).json({ error: 'deal_id required' });
    if (!await assertDealAccess(deal_id, req.subscriber!.id, req.subscriber!.is_admin)) {
      return res.status(403).json({ error: 'Access denied — you must be an accepted party on this deal' });
    }
    const deal = await queryOne<Record<string, unknown>>('SELECT * FROM cdi.deals WHERE id=$1', [deal_id]);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    const parties = await query(
      `SELECT dp.role, s.name, s.email, s.account_type FROM cdi.deal_parties dp JOIN digest.subscribers s ON s.id=dp.subscriber_id WHERE dp.deal_id=$1`,
      [deal_id]
    );
    const doc = await callClaudeDoc(
      `You are an expert Nigerian capital markets lawyer drafting documents for CDI (Capital Deals Interface). 
       Produce a formal, professional Letter of Offer using Nigerian legal standards, SEC Nigeria guidelines, and FMDQ conventions where applicable. 
       Use Nigerian Naira (₦) and reference relevant laws (CAMA 2020, ISA 2007, FMDQ Exchange Rules). 
       Return plain text formatted as a formal legal document. No JSON, no markdown.`,
      `Draft a Letter of Offer for this transaction:\n\nDeal Details: ${JSON.stringify(deal, null, 2)}\n\nParties: ${JSON.stringify(parties, null, 2)}`
    );
    await query(`UPDATE cdi.deals SET ai_documents=jsonb_set(COALESCE(ai_documents,'{}'), '{letter_of_offer}', $1::jsonb) WHERE id=$2`,
      [JSON.stringify({ content: doc, generated_at: new Date().toISOString(), generated_by: req.subscriber!.id }), deal_id]);
    await logEvent('ai.doc.generated', req.subscriber!.id, req.subscriber!.email, 'deal', deal_id, { doc_type: 'letter_of_offer' }, req);
    res.json({ document: doc, doc_type: 'letter_of_offer' });
  } catch (err) { res.status(500).json({ error: 'AI service unavailable' }); }
});

// POST /ai/generate-subscription-agreement
aiRouter.post('/generate-subscription-agreement', ...proMiddleware, async (req: Request, res: Response) => {
  try {
    const { deal_id } = req.body;
    if (!deal_id) return res.status(400).json({ error: 'deal_id required' });
    if (!await assertDealAccess(deal_id, req.subscriber!.id, req.subscriber!.is_admin)) {
      return res.status(403).json({ error: 'Access denied — you must be an accepted party on this deal' });
    }
    const deal = await queryOne<Record<string, unknown>>('SELECT * FROM cdi.deals WHERE id=$1', [deal_id]);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    const parties = await query(
      `SELECT dp.role, s.name, s.email, s.account_type FROM cdi.deal_parties dp JOIN digest.subscribers s ON s.id=dp.subscriber_id WHERE dp.deal_id=$1`,
      [deal_id]
    );
    const doc = await callClaudeDoc(
      `You are an expert Nigerian capital markets lawyer drafting documents for CDI (Capital Deals Interface). 
       Produce a formal, professional Subscription Agreement using Nigerian legal standards, SEC Nigeria guidelines, and FMDQ conventions where applicable. 
       Use Nigerian Naira (₦) and reference relevant laws (CAMA 2020, ISA 2007, FMDQ Exchange Rules). 
       Return plain text formatted as a formal legal document. No JSON, no markdown.`,
      `Draft a Subscription Agreement for this transaction:\n\nDeal Details: ${JSON.stringify(deal, null, 2)}\n\nParties: ${JSON.stringify(parties, null, 2)}`
    );
    await query(`UPDATE cdi.deals SET ai_documents=jsonb_set(COALESCE(ai_documents,'{}'), '{subscription_agreement}', $1::jsonb) WHERE id=$2`,
      [JSON.stringify({ content: doc, generated_at: new Date().toISOString(), generated_by: req.subscriber!.id }), deal_id]);
    await logEvent('ai.doc.generated', req.subscriber!.id, req.subscriber!.email, 'deal', deal_id, { doc_type: 'subscription_agreement' }, req);
    res.json({ document: doc, doc_type: 'subscription_agreement' });
  } catch (err) { res.status(500).json({ error: 'AI service unavailable' }); }
});

// POST /ai/generate-deed-of-assignment
aiRouter.post('/generate-deed-of-assignment', ...proMiddleware, async (req: Request, res: Response) => {
  try {
    const { deal_id } = req.body;
    if (!deal_id) return res.status(400).json({ error: 'deal_id required' });
    if (!await assertDealAccess(deal_id, req.subscriber!.id, req.subscriber!.is_admin)) {
      return res.status(403).json({ error: 'Access denied — you must be an accepted party on this deal' });
    }
    const deal = await queryOne<Record<string, unknown>>('SELECT * FROM cdi.deals WHERE id=$1', [deal_id]);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    const parties = await query(
      `SELECT dp.role, s.name, s.email, s.account_type FROM cdi.deal_parties dp JOIN digest.subscribers s ON s.id=dp.subscriber_id WHERE dp.deal_id=$1`,
      [deal_id]
    );
    const doc = await callClaudeDoc(
      `You are an expert Nigerian capital markets lawyer drafting documents for CDI (Capital Deals Interface). 
       Produce a formal, professional Deed of Assignment using Nigerian legal standards, SEC Nigeria guidelines, and FMDQ conventions where applicable. 
       Use Nigerian Naira (₦) and reference relevant laws (CAMA 2020, ISA 2007, Stamp Duties Act). 
       Return plain text formatted as a formal legal document. No JSON, no markdown.`,
      `Draft a Deed of Assignment for this transaction:\n\nDeal Details: ${JSON.stringify(deal, null, 2)}\n\nParties: ${JSON.stringify(parties, null, 2)}`
    );
    await query(`UPDATE cdi.deals SET ai_documents=jsonb_set(COALESCE(ai_documents,'{}'), '{deed_of_assignment}', $1::jsonb) WHERE id=$2`,
      [JSON.stringify({ content: doc, generated_at: new Date().toISOString(), generated_by: req.subscriber!.id }), deal_id]);
    await logEvent('ai.doc.generated', req.subscriber!.id, req.subscriber!.email, 'deal', deal_id, { doc_type: 'deed_of_assignment' }, req);
    res.json({ document: doc, doc_type: 'deed_of_assignment' });
  } catch (err) { res.status(500).json({ error: 'AI service unavailable' }); }
});

// POST /ai/generate-comfort-letter
aiRouter.post('/generate-comfort-letter', ...proMiddleware, async (req: Request, res: Response) => {
  try {
    const { deal_id } = req.body;
    if (!deal_id) return res.status(400).json({ error: 'deal_id required' });
    if (!await assertDealAccess(deal_id, req.subscriber!.id, req.subscriber!.is_admin)) {
      return res.status(403).json({ error: 'Access denied — you must be an accepted party on this deal' });
    }
    const deal = await queryOne<Record<string, unknown>>('SELECT * FROM cdi.deals WHERE id=$1', [deal_id]);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    const parties = await query(
      `SELECT dp.role, s.name, s.email, s.account_type FROM cdi.deal_parties dp JOIN digest.subscribers s ON s.id=dp.subscriber_id WHERE dp.deal_id=$1`,
      [deal_id]
    );
    const doc = await callClaudeDoc(
      `You are an expert Nigerian capital markets lawyer drafting documents for CDI (Capital Deals Interface). 
       Produce a formal Comfort Letter (bank comfort letter confirming fund availability and legitimacy) using Nigerian banking standards and CBN guidelines. 
       Use Nigerian Naira (₦) and reference relevant regulations (CBN Prudential Guidelines, BOFIA 2020). 
       Return plain text formatted as a formal bank letter. No JSON, no markdown.`,
      `Draft a Comfort Letter for this transaction:\n\nDeal Details: ${JSON.stringify(deal, null, 2)}\n\nParties: ${JSON.stringify(parties, null, 2)}`,
      2048
    );
    await query(`UPDATE cdi.deals SET ai_documents=jsonb_set(COALESCE(ai_documents,'{}'), '{comfort_letter}', $1::jsonb) WHERE id=$2`,
      [JSON.stringify({ content: doc, generated_at: new Date().toISOString(), generated_by: req.subscriber!.id }), deal_id]);
    await logEvent('ai.doc.generated', req.subscriber!.id, req.subscriber!.email, 'deal', deal_id, { doc_type: 'comfort_letter' }, req);
    res.json({ document: doc, doc_type: 'comfort_letter' });
  } catch (err) { res.status(500).json({ error: 'AI service unavailable' }); }
});

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────
export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/stats', async (_req, res: Response) => {
  const [subs] = await query(`
    SELECT COUNT(*) FILTER (WHERE account_type='retail') as retail,
           COUNT(*) FILTER (WHERE account_type='qualified') as qualified,
           COUNT(*) FILTER (WHERE account_type IN ('broker','fund_manager','corporate','institutional')) as professional,
           COUNT(*) FILTER (WHERE kyc_status='submitted' OR kyc_status='under_review') as kyc_queue
    FROM digest.subscribers`);
  const [deals] = await query(`SELECT COUNT(*) FILTER (WHERE status='open') as active, COUNT(*) as total FROM cdi.deals`);
  const [escrow] = await query(`SELECT COALESCE(SUM(amount),0) as locked FROM cdi.escrow_transactions WHERE status IN ('funded','conditions_checking')`);
  const [delivery] = await query(`SELECT COUNT(*) FILTER (WHERE status IN ('sent','delivered')) as sent_today, COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as opened_today FROM digest.deliveries WHERE digest_date=CURRENT_DATE`);
  res.json({ subscribers: subs, deals, escrow, delivery });
});

adminRouter.get('/subscribers', async (req: Request, res: Response) => {
  const { account_type, kyc_status, page = 1 } = req.query;
  const conditions: string[] = [];
  if (account_type) conditions.push(`s.account_type='${account_type}'`);
  if (kyc_status) conditions.push(`s.kyc_status='${kyc_status}'`);
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const subs = await query(
    `SELECT s.id, s.email, s.name, s.account_type, s.kyc_status, s.account_status, s.created_at, sub.plan,
            (SELECT COUNT(*) FROM cdi.deal_parties dp WHERE dp.subscriber_id=s.id) as deal_count
     FROM digest.subscribers s LEFT JOIN digest.subscriptions sub ON sub.subscriber_id=s.id
     ${where} ORDER BY s.created_at DESC LIMIT 50 OFFSET $1`,
    [(Number(page) - 1) * 50]
  );
  res.json(subs);
});

adminRouter.post('/subscribers/:id/suspend', async (req: Request, res: Response) => {
  const { reason } = req.body;
  const sub = await queryOne<{ name: string; email: string }>('SELECT name, email FROM digest.subscribers WHERE id=$1', [req.params.id]);
  if (!sub) return res.status(404).json({ error: 'Not found' });

  await query(
    `UPDATE digest.subscribers SET account_status='suspended', suspension_reason=$1, suspended_at=NOW(), suspended_by=$2, refresh_token=NULL WHERE id=$3`,
    [reason, req.body.admin_id ?? null, req.params.id]
  );
  await sendAccountSuspendedEmail(sub.email, sub.name, reason);
  await logEvent('account.suspended', req.params.id, sub.email, 'subscriber', req.params.id, { reason });
  res.json({ message: 'Account suspended' });
});

adminRouter.post('/subscribers/:id/reinstate', async (req: Request, res: Response) => {
  await query(
    `UPDATE digest.subscribers SET account_status='active', suspension_reason=NULL, suspended_at=NULL, suspended_by=NULL WHERE id=$1`,
    [req.params.id]
  );
  await logEvent('account.reinstated', req.params.id, null, 'subscriber', req.params.id, {});
  res.json({ message: 'Account reinstated' });
});

adminRouter.delete('/subscribers/:id', async (req: Request, res: Response) => {
  const sub = await queryOne<{ email: string }>('SELECT email FROM digest.subscribers WHERE id=$1', [req.params.id]);
  await logEvent('account.deleted', req.params.id, sub?.email ?? null, 'subscriber', req.params.id, {});
  await query('DELETE FROM digest.subscribers WHERE id=$1', [req.params.id]);
  res.json({ message: 'Account deleted (NDPR erasure complete)' });
});

adminRouter.get('/kyc/pending', async (_req, res: Response) => {
  const records = await query(
    `SELECT k.*, s.name, s.email, s.account_type FROM digest.kyc_records k
     JOIN digest.subscribers s ON s.id = k.subscriber_id
     WHERE k.status IN ('submitted','under_review') ORDER BY k.submitted_at ASC`
  );
  res.json(records);
});

adminRouter.put('/kyc/:id/review', async (req: Request, res: Response) => {
  const { decision, notes, rejection_reason } = req.body;
  const kyc = await queryOne<{ subscriber_id: string }>('SELECT subscriber_id FROM digest.kyc_records WHERE id=$1', [req.params.id]);
  if (!kyc) return res.status(404).json({ error: 'KYC record not found' });

  await query(
    `UPDATE digest.kyc_records SET status=$1, reviewed_by=$2, review_notes=$3, rejection_reason=$4,
     verified_at=CASE WHEN $1='verified' THEN NOW() ELSE NULL END WHERE id=$5`,
    [decision, req.subscriber!.id, notes, rejection_reason ?? null, req.params.id]
  );
  await query(`UPDATE digest.subscribers SET kyc_status=$1 WHERE id=$2`, [decision, kyc.subscriber_id]);

  const sub = await queryOne<{ email: string; name: string; account_type: string }>('SELECT email, name, account_type FROM digest.subscribers WHERE id=$1', [kyc.subscriber_id]);
  if (sub) {
    if (decision === 'verified') {
      await sendKycApprovedEmail(sub.email, sub.name, sub.account_type);
      await createNotification(kyc.subscriber_id, 'kyc_approved', 'Account verified', 'Your identity has been verified. You can now access deals.', 'subscriber', kyc.subscriber_id);
    } else {
      await sendKycRejectedEmail(sub.email, sub.name, rejection_reason ?? 'Documents could not be verified');
      await createNotification(kyc.subscriber_id, 'kyc_rejected', 'Verification unsuccessful', `Your KYC was not approved: ${rejection_reason}`, 'subscriber', kyc.subscriber_id);
    }
  }
  await logEvent(decision === 'verified' ? 'kyc.approved' : 'kyc.rejected', req.subscriber!.id, req.subscriber!.email, 'kyc', req.params.id, { decision, notes });
  res.json({ message: `KYC ${decision}` });
});

adminRouter.get('/escrow/active', async (_req, res: Response) => {
  const escrows = await query(
    `SELECT et.*, d.reference, d.title, d.expiry_at, s.name as funded_by_name
     FROM cdi.escrow_transactions et
     JOIN cdi.deals d ON d.id = et.deal_id
     JOIN digest.subscribers s ON s.id = et.funded_by
     WHERE et.status IN ('funded','conditions_checking','disputed')
     ORDER BY et.funded_at DESC`
  );
  res.json(escrows);
});

adminRouter.post('/escrow/:id/release', async (req: Request, res: Response) => {
  const { reason } = req.body;
  await query(`UPDATE cdi.escrow_transactions SET status='released', released_at=NOW(), release_triggered_by='admin_manual', admin_notes=$1, updated_at=NOW() WHERE id=$2`, [reason, req.params.id]);
  const escrow = await queryOne<{ deal_id: string }>('SELECT deal_id FROM cdi.escrow_transactions WHERE id=$1', [req.params.id]);
  if (escrow) await query(`UPDATE cdi.deals SET status='completed', updated_at=NOW() WHERE id=$1`, [escrow.deal_id]);
  await logEvent('escrow.released', req.subscriber!.id, req.subscriber!.email, 'escrow', req.params.id, { reason, trigger: 'admin_manual' });
  res.json({ message: 'Escrow released' });
});

adminRouter.post('/escrow/:id/refund', async (req: Request, res: Response) => {
  const { reason } = req.body;
  await query(`UPDATE cdi.escrow_transactions SET status='refunded', refunded_at=NOW(), release_triggered_by='admin_manual', admin_notes=$1, updated_at=NOW() WHERE id=$2`, [reason, req.params.id]);
  await logEvent('escrow.refunded', req.subscriber!.id, req.subscriber!.email, 'escrow', req.params.id, { reason, trigger: 'admin_manual' });
  res.json({ message: 'Escrow refunded' });
});

adminRouter.get('/deals', async (req: Request, res: Response) => {
  const deals = await query(
    `SELECT d.*, s.name as creator_name FROM cdi.deals d JOIN digest.subscribers s ON s.id=d.created_by
     ORDER BY d.created_at DESC LIMIT 50`
  );
  res.json(deals);
});

adminRouter.get('/audit', async (req: Request, res: Response) => {
  const { actor_id, entity_type, entity_id, event_type, from, to, page = 1 } = req.query;
  const conditions: string[] = [];
  if (actor_id) conditions.push(`actor_id='${actor_id}'`);
  if (entity_type) conditions.push(`entity_type='${entity_type}'`);
  if (entity_id) conditions.push(`entity_id='${entity_id}'`);
  if (event_type) conditions.push(`event_type ILIKE '%${event_type}%'`);
  if (from) conditions.push(`created_at >= '${from}'`);
  if (to) conditions.push(`created_at <= '${to}'`);
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const events = await query(`SELECT * FROM audit.events ${where} ORDER BY created_at DESC LIMIT 50 OFFSET $1`, [(Number(page) - 1) * 50]);
  res.json(events);
});

adminRouter.get('/audit/export', async (req: Request, res: Response) => {
  const events = await query(`SELECT id, event_type, actor_email, entity_type, entity_id, ip_address, created_at FROM audit.events ORDER BY created_at DESC LIMIT 10000`);
  const csv = ['id,event_type,actor_email,entity_type,entity_id,ip_address,created_at',
    ...events.map((e: any) => `${e.id},${e.event_type},${e.actor_email ?? ''},${e.entity_type ?? ''},${e.entity_id ?? ''},${e.ip_address ?? ''},${e.created_at}`)
  ].join('\n');
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', `attachment; filename="audit-export-${Date.now()}.csv"`);
  res.send(csv);
});

adminRouter.post('/digest/trigger', async (req: Request, res: Response) => {
  const date = req.body.date ?? new Date().toISOString().split('T')[0];
  res.json({ message: `Digest composition triggered for ${date}` });
  // Job picked up by pg-boss scheduler
});

adminRouter.get('/digest/preview/:date', async (req: Request, res: Response) => {
  const archive = await queryOne('SELECT * FROM digest.archive WHERE digest_date=$1', [req.params.date]);
  if (!archive) return res.status(404).json({ error: 'No digest for that date' });
  res.json(archive);
});

adminRouter.get('/digest/stats', async (req: Request, res: Response) => {
  const date = req.query.date ?? new Date().toISOString().split('T')[0];
  const stats = await query(
    `SELECT channel, status, COUNT(*) as count FROM digest.deliveries WHERE digest_date=$1 GROUP BY channel, status`, [date]
  );
  res.json(stats);
});

adminRouter.post('/deals/:id/checklist/override', async (req: Request, res: Response) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'Reason required for checklist override' });
  await query(
    `UPDATE cdi.deals SET checklist_override=TRUE, checklist_override_by=$1, checklist_override_reason=$2 WHERE id=$3`,
    [req.subscriber!.id, reason, req.params.id]
  );
  await logEvent('deal.checklist_override', req.subscriber!.id, req.subscriber!.email, 'deal', req.params.id, { reason }, req);
  res.json({ message: 'Checklist override applied. Escrow funding is now permitted.' });
});
