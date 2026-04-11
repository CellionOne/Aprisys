import { Router, Request, Response } from 'express';
import { requireAuth, requireProfessional, requireVerifiedKyc } from '../middleware/auth.js';
import { query, queryOne } from '../db/client.js';
import { logEvent } from '../services/audit.js';
import { createNotification } from '../services/notifications.js';
import { scoreDealRisk, getMarketContext } from '../services/aiService.js';
import { sendDealInvitationEmail } from '../services/email.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const proMiddleware = [requireAuth, requireProfessional, requireVerifiedKyc];

// GET /deals
router.get('/', requireAuth, requireProfessional, async (req: Request, res: Response) => {
  const { status, type, my_deals, page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  if (my_deals === 'true') {
    const deals = await query(
      `SELECT d.*, s.name as creator_name,
              (SELECT COUNT(*) FROM cdi.deal_parties dp WHERE dp.deal_id = d.id AND dp.status = 'accepted') as party_count,
              et.status as escrow_status, et.amount as escrow_amount
       FROM cdi.deals d
       JOIN digest.subscribers s ON s.id = d.created_by
       LEFT JOIN cdi.deal_parties dp2 ON dp2.deal_id = d.id AND dp2.subscriber_id = $1
       LEFT JOIN cdi.escrow_transactions et ON et.deal_id = d.id
       WHERE (d.created_by = $1 OR dp2.subscriber_id = $1)
       ${status ? `AND d.status = '${status}'` : ''}
       ${type ? `AND d.deal_type = '${type}'` : ''}
       ORDER BY d.updated_at DESC LIMIT $2 OFFSET $3`,
      [req.subscriber!.id, limit, offset]
    );
    return res.json(deals);
  }

  // Marketplace deals
  const deals = await query(
    `SELECT d.*, s.name as creator_name, s.kyc_status as creator_kyc,
            (SELECT COUNT(*) FROM cdi.deal_parties dp WHERE dp.deal_id = d.id AND dp.status = 'accepted') as party_count
     FROM cdi.deals d
     JOIN digest.subscribers s ON s.id = d.created_by
     WHERE d.visibility = 'marketplace' AND d.status = 'open'
       AND d.created_by != $1
       AND NOT EXISTS (SELECT 1 FROM cdi.deal_parties dp WHERE dp.deal_id = d.id AND dp.subscriber_id = $1)
     ${type ? `AND d.deal_type = '${type}'` : ''}
     ORDER BY d.created_at DESC LIMIT $2 OFFSET $3`,
    [req.subscriber!.id, limit, offset]
  );
  res.json(deals);
});

// POST /deals
router.post('/', ...proMiddleware, async (req: Request, res: Response) => {
  const {
    title, deal_type, asset_ticker, asset_name, quantity, unit_price, total_value,
    conditions = [], expiry_at, visibility = 'private', commission_pct = 0,
    required_signatories = 1, notes
  } = req.body;

  if (!title || !deal_type) return res.status(400).json({ error: 'title and deal_type are required' });

  const [deal] = await query<{ id: string; reference: string }>(
    `INSERT INTO cdi.deals (created_by, title, deal_type, asset_ticker, asset_name, quantity, unit_price, total_value, conditions, expiry_at, visibility, commission_pct, required_signatories, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id, reference`,
    [req.subscriber!.id, title, deal_type, asset_ticker ?? null, asset_name ?? null,
     quantity ?? null, unit_price ?? null, total_value ?? null,
     JSON.stringify(conditions), expiry_at ?? null, visibility, commission_pct, required_signatories, notes ?? null]
  );

  // Add creator as a party
  await query(
    `INSERT INTO cdi.deal_parties (deal_id, subscriber_id, role, status) VALUES ($1,$2,'creator','accepted')`,
    [deal.id, req.subscriber!.id]
  );

  // Async risk scoring
  if (asset_ticker) {
    scoreDealRisk(deal.id, req.subscriber!.id)
      .then(riskData => query(`UPDATE cdi.deals SET cie_risk_score=$1 WHERE id=$2`, [(riskData as any).risk_score, deal.id]))
      .catch(err => console.error('[AI] Risk score failed:', err));
  }

  await logEvent('deal.created', req.subscriber!.id, req.subscriber!.email, 'deal', deal.id, { reference: deal.reference, deal_type }, req);
  await createNotification(req.subscriber!.id, 'deal_invited', 'Deal created', `Deal ${deal.reference} has been created.`, 'deal', deal.id);

  res.status(201).json(deal);
});

// GET /deals/:id
router.get('/:id', ...proMiddleware, async (req: Request, res: Response) => {
  const deal = await queryOne<Record<string, unknown>>(
    `SELECT d.*, s.name as creator_name, s.kyc_status as creator_kyc_status
     FROM cdi.deals d JOIN digest.subscribers s ON s.id = d.created_by WHERE d.id=$1`,
    [req.params.id]
  );
  if (!deal) return res.status(404).json({ error: 'Deal not found' });

  // Check access
  const party = await queryOne(
    `SELECT id FROM cdi.deal_parties WHERE deal_id=$1 AND subscriber_id=$2`,
    [req.params.id, req.subscriber!.id]
  );
  const isMarketplace = deal.visibility === 'marketplace';
  if (!party && !isMarketplace && !req.subscriber!.is_admin) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const parties = await query(
    `SELECT dp.*, s.name, s.account_type, s.kyc_status,
            COALESCE(AVG(cr.score), 0) as reputation_score,
            COUNT(DISTINCT cr.id) as rating_count
     FROM cdi.deal_parties dp
     JOIN digest.subscribers s ON s.id = dp.subscriber_id
     LEFT JOIN cdi.counterparty_ratings cr ON cr.rated_id = dp.subscriber_id
     WHERE dp.deal_id=$1 GROUP BY dp.id, s.name, s.account_type, s.kyc_status`,
    [req.params.id]
  );

  const escrow = await queryOne('SELECT * FROM cdi.escrow_transactions WHERE deal_id=$1', [req.params.id]);
  const docs = await query('SELECT id, filename, document_type, version, mime_type, file_size, created_at FROM cdi.deal_documents WHERE deal_id=$1 ORDER BY created_at DESC', [req.params.id]);

  res.json({ ...deal, parties, escrow, documents: docs });
});

// PUT /deals/:id
router.put('/:id', ...proMiddleware, async (req: Request, res: Response) => {
  const deal = await queryOne<{ created_by: string; status: string; terms_locked: boolean }>(
    'SELECT created_by, status, terms_locked FROM cdi.deals WHERE id=$1', [req.params.id]
  );
  if (!deal) return res.status(404).json({ error: 'Deal not found' });
  if (deal.created_by !== req.subscriber!.id) return res.status(403).json({ error: 'Only the deal creator can edit' });
  if (!['draft', 'open'].includes(deal.status)) return res.status(400).json({ error: 'Cannot edit deal in current status' });
  if (deal.terms_locked) return res.status(400).json({ error: 'Terms are locked after acceptance' });

  const { title, total_value, conditions, expiry_at, visibility, notes, commission_pct } = req.body;
  await query(
    `UPDATE cdi.deals SET title=COALESCE($1,title), total_value=COALESCE($2,total_value),
     conditions=COALESCE($3,conditions), expiry_at=COALESCE($4,expiry_at),
     visibility=COALESCE($5,visibility), notes=COALESCE($6,notes),
     commission_pct=COALESCE($7,commission_pct), updated_at=NOW() WHERE id=$8`,
    [title, total_value, conditions ? JSON.stringify(conditions) : null, expiry_at, visibility, notes, commission_pct, req.params.id]
  );
  await logEvent('deal.updated', req.subscriber!.id, req.subscriber!.email, 'deal', req.params.id, {}, req);
  res.json({ message: 'Deal updated' });
});

// POST /deals/:id/publish
router.post('/:id/publish', ...proMiddleware, async (req: Request, res: Response) => {
  const deal = await queryOne<{ created_by: string; status: string; title: string }>(
    'SELECT created_by, status, title FROM cdi.deals WHERE id=$1', [req.params.id]
  );
  if (!deal) return res.status(404).json({ error: 'Deal not found' });
  if (deal.created_by !== req.subscriber!.id) return res.status(403).json({ error: 'Forbidden' });
  if (deal.status !== 'draft') return res.status(400).json({ error: 'Only draft deals can be published' });

  await query(`UPDATE cdi.deals SET status='open', updated_at=NOW() WHERE id=$1`, [req.params.id]);
  await logEvent('deal.published', req.subscriber!.id, req.subscriber!.email, 'deal', req.params.id, {}, req);
  res.json({ message: 'Deal published' });
});

// POST /deals/:id/invite
router.post('/:id/invite', ...proMiddleware, async (req: Request, res: Response) => {
  const { email_or_id, role, commission_pct = 0 } = req.body;

  const invitee = await queryOne<{ id: string; name: string; email: string; kyc_status: string }>(
    `SELECT id, name, email, kyc_status FROM digest.subscribers WHERE (email=$1 OR id::text=$1) AND account_status='active'`,
    [email_or_id]
  );
  if (!invitee) return res.status(404).json({ error: 'Subscriber not found' });
  if (invitee.kyc_status !== 'verified') return res.status(400).json({ error: 'Invitee must be KYC verified' });

  const existing = await queryOne('SELECT id FROM cdi.deal_parties WHERE deal_id=$1 AND subscriber_id=$2', [req.params.id, invitee.id]);
  if (existing) return res.status(409).json({ error: 'Already a party to this deal' });

  const deal = await queryOne<{ reference: string; title: string; deal_type: string; total_value: number; currency: string }>(
    'SELECT reference, title, deal_type, total_value, currency FROM cdi.deals WHERE id=$1', [req.params.id]
  );
  if (!deal) return res.status(404).json({ error: 'Deal not found' });

  await query(
    `INSERT INTO cdi.deal_parties (deal_id, subscriber_id, role, status, commission_pct) VALUES ($1,$2,$3,'invited',$4)`,
    [req.params.id, invitee.id, role, commission_pct]
  );

  const accept_token = uuidv4();
  const decline_token = uuidv4();

  await sendDealInvitationEmail(invitee.email, invitee.name, deal, role, req.subscriber!.name, accept_token, decline_token);
  await createNotification(invitee.id, 'deal_invited', `Deal invitation: ${deal.reference}`, `${req.subscriber!.name} invited you to participate as ${role}`, 'deal', req.params.id);
  await logEvent('deal.party_invited', req.subscriber!.id, req.subscriber!.email, 'deal', req.params.id, { invitee_id: invitee.id, role }, req);

  res.json({ message: `Invitation sent to ${invitee.email}` });
});

// POST /deals/:id/respond
router.post('/:id/respond', ...proMiddleware, async (req: Request, res: Response) => {
  const { response } = req.body;
  if (!['accepted', 'declined'].includes(response)) return res.status(400).json({ error: 'Response must be accepted or declined' });

  await query(
    `UPDATE cdi.deal_parties SET status=$1, responded_at=NOW() WHERE deal_id=$2 AND subscriber_id=$3`,
    [response, req.params.id, req.subscriber!.id]
  );

  if (response === 'accepted') {
    await query(
      `INSERT INTO cdi.deal_messages (deal_id, sender_id, message, message_type) VALUES ($1,$2,$3,'system')`,
      [req.params.id, req.subscriber!.id, `${req.subscriber!.name} joined the deal room as ${response}`]
    );
    const deal = await queryOne<{ created_by: string; reference: string }>('SELECT created_by, reference FROM cdi.deals WHERE id=$1', [req.params.id]);
    if (deal) {
      await createNotification(deal.created_by, 'deal_accepted', 'Party accepted invitation', `${req.subscriber!.name} accepted your invitation to deal ${deal.reference}`, 'deal', req.params.id);
    }
  }

  await logEvent('deal.party_responded', req.subscriber!.id, req.subscriber!.email, 'deal', req.params.id, { response }, req);
  res.json({ message: `Invitation ${response}` });
});

// POST /deals/:id/eoi
router.post('/:id/eoi', ...proMiddleware, async (req: Request, res: Response) => {
  const { message } = req.body;

  const existing = await queryOne('SELECT id FROM cdi.eoi_submissions WHERE deal_id=$1 AND subscriber_id=$2', [req.params.id, req.subscriber!.id]);
  if (existing) return res.status(409).json({ error: 'EOI already submitted' });

  await query(
    `INSERT INTO cdi.eoi_submissions (deal_id, subscriber_id, message) VALUES ($1,$2,$3)`,
    [req.params.id, req.subscriber!.id, message ?? null]
  );

  const deal = await queryOne<{ created_by: string; reference: string }>('SELECT created_by, reference FROM cdi.deals WHERE id=$1', [req.params.id]);
  if (deal) {
    await createNotification(deal.created_by, 'eoi_received', 'New expression of interest',
      `${req.subscriber!.name} submitted an EOI for deal ${deal.reference}${message ? `: "${message}"` : ''}`, 'deal', req.params.id);
  }

  await logEvent('deal.eoi_submitted', req.subscriber!.id, req.subscriber!.email, 'deal', req.params.id, {}, req);
  res.json({ message: 'Expression of interest submitted' });
});

// GET /deals/:id/eoi
router.get('/:id/eoi', ...proMiddleware, async (req: Request, res: Response) => {
  const deal = await queryOne<{ created_by: string }>('SELECT created_by FROM cdi.deals WHERE id=$1', [req.params.id]);
  if (deal?.created_by !== req.subscriber!.id && !req.subscriber!.is_admin) {
    return res.status(403).json({ error: 'Only the deal creator can view EOIs' });
  }
  const eois = await query(
    `SELECT e.*, s.name, s.email, s.account_type, s.kyc_status
     FROM cdi.eoi_submissions e JOIN digest.subscribers s ON s.id = e.subscriber_id
     WHERE e.deal_id=$1 ORDER BY e.submitted_at DESC`,
    [req.params.id]
  );
  res.json(eois);
});

// PUT /deals/:id/eoi/:eoiId/respond
router.put('/:id/eoi/:eoiId/respond', ...proMiddleware, async (req: Request, res: Response) => {
  const { response } = req.body; // 'invited' or 'declined'
  const eoi = await queryOne<{ subscriber_id: string }>('SELECT subscriber_id FROM cdi.eoi_submissions WHERE id=$1', [req.params.eoiId]);
  if (!eoi) return res.status(404).json({ error: 'EOI not found' });

  await query(`UPDATE cdi.eoi_submissions SET status=$1 WHERE id=$2`, [response, req.params.eoiId]);

  if (response === 'invited') {
    await query(
      `INSERT INTO cdi.deal_parties (deal_id, subscriber_id, role, status, eoi_submitted) VALUES ($1,$2,'buyer','invited',TRUE)
       ON CONFLICT (deal_id, subscriber_id) DO UPDATE SET status='invited'`,
      [req.params.id, eoi.subscriber_id]
    );
    const deal = await queryOne<{ reference: string }>('SELECT reference FROM cdi.deals WHERE id=$1', [req.params.id]);
    await createNotification(eoi.subscriber_id, 'deal_invited', 'Invited to deal', `Your EOI was accepted. You've been invited to deal ${deal?.reference}.`, 'deal', req.params.id);
  }
  res.json({ message: `EOI ${response}` });
});

// GET /deals/:id/parties
router.get('/:id/parties', ...proMiddleware, async (req: Request, res: Response) => {
  const parties = await query(
    `SELECT dp.*, s.name, s.email, s.account_type, s.kyc_status,
            COALESCE(AVG(cr.score), 0) as reputation_score
     FROM cdi.deal_parties dp
     JOIN digest.subscribers s ON s.id = dp.subscriber_id
     LEFT JOIN cdi.counterparty_ratings cr ON cr.rated_id = dp.subscriber_id
     WHERE dp.deal_id=$1 GROUP BY dp.id, s.name, s.email, s.account_type, s.kyc_status`,
    [req.params.id]
  );
  res.json(parties);
});

// POST /deals/:id/rate
router.post('/:id/rate', ...proMiddleware, async (req: Request, res: Response) => {
  const { rated_id, score, comment } = req.body;
  if (!score || score < 1 || score > 5) return res.status(400).json({ error: 'Score must be 1-5' });

  const deal = await queryOne<{ status: string }>('SELECT status FROM cdi.deals WHERE id=$1', [req.params.id]);
  if (deal?.status !== 'completed') return res.status(400).json({ error: 'Can only rate after deal completion' });
  if (rated_id === req.subscriber!.id) return res.status(400).json({ error: 'Cannot rate yourself' });

  await query(
    `INSERT INTO cdi.counterparty_ratings (deal_id, rater_id, rated_id, score, comment) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (deal_id, rater_id, rated_id) DO UPDATE SET score=$4, comment=$5`,
    [req.params.id, req.subscriber!.id, rated_id, score, comment ?? null]
  );

  const rated = await queryOne<{ name: string }>('SELECT name FROM digest.subscribers WHERE id=$1', [rated_id]);
  await createNotification(rated_id, 'rating_prompt', 'New rating received',
    `${req.subscriber!.name} gave you ${score} stars on deal ${req.params.id}`, 'deal', req.params.id);

  await logEvent('rating.submitted', req.subscriber!.id, req.subscriber!.email, 'deal', req.params.id, { score, rated_id }, req);
  res.json({ message: 'Rating submitted' });
});

export default router;
