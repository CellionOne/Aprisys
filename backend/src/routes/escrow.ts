// ─── ESCROW ROUTES ───────────────────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { requireAuth, requireProfessional, requireVerifiedKyc, requireAdmin } from '../middleware/auth.js';
import { query, queryOne } from '../db/client.js';
import { logEvent } from '../services/audit.js';
import { createNotification, createNotificationForDealParties } from '../services/notifications.js';
import { initializeTransaction, verifyTransaction } from '../services/paystack.js';
import { sendDealStatusEmail } from '../services/email.js';

export const escrowRouter = Router();
const proMiddleware = [requireAuth, requireProfessional, requireVerifiedKyc];

// POST /escrow/initialise
escrowRouter.post('/initialise', ...proMiddleware, async (req: Request, res: Response) => {
  const { deal_id } = req.body;
  const deal = await queryOne<{ id: string; total_value: number; status: string; reference: string }>(
    'SELECT id, total_value, status, reference FROM cdi.deals WHERE id=$1', [deal_id]
  );
  if (!deal) return res.status(404).json({ error: 'Deal not found' });
  if (deal.status !== 'open') return res.status(400).json({ error: 'Deal must be open to fund escrow' });
  if (!deal.total_value) return res.status(400).json({ error: 'Deal has no total value set' });

  const result = await initializeTransaction({
    email: req.subscriber!.email,
    amount: Math.round(deal.total_value * 100),
    metadata: { deal_id, subscriber_id: req.subscriber!.id, deal_reference: deal.reference },
    callback_url: `${process.env.FRONTEND_URL}/deals/${deal_id}?tab=escrow&session=success`,
  });

  // Create pending escrow record
  await query(
    `INSERT INTO cdi.escrow_transactions (deal_id, funded_by, amount, paystack_reference)
     VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [deal_id, req.subscriber!.id, deal.total_value, result.reference]
  );

  res.json({ authorization_url: result.authorization_url, reference: result.reference });
});

// POST /escrow/:dealId/verify-funding
escrowRouter.post('/:dealId/verify-funding', ...proMiddleware, async (req: Request, res: Response) => {
  const { reference } = req.body;
  try {
    const verification = await verifyTransaction(reference) as Record<string, unknown>;
    if ((verification as any).status !== 'success') return res.status(400).json({ error: 'Payment not successful' });

    await query(
      `UPDATE cdi.escrow_transactions SET status='funded', funded_at=NOW(), updated_at=NOW()
       WHERE deal_id=$1 AND paystack_reference=$2`,
      [req.params.dealId, reference]
    );
    await query(`UPDATE cdi.deals SET status='funded', updated_at=NOW() WHERE id=$1`, [req.params.dealId]);

    const deal = await queryOne<{ reference: string }>('SELECT reference FROM cdi.deals WHERE id=$1', [req.params.dealId]);
    await createNotificationForDealParties(req.params.dealId, null, 'escrow_funded', 'Escrow funded',
      `${req.subscriber!.name} has funded the escrow for deal ${deal?.reference}.`);
    await logEvent('escrow.funded', req.subscriber!.id, req.subscriber!.email, 'escrow', req.params.dealId, { amount: (verification as any).amount / 100 }, req);

    res.json({ message: 'Escrow funded successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

// GET /escrow/:dealId/status
escrowRouter.get('/:dealId/status', ...proMiddleware, async (req: Request, res: Response) => {
  const escrow = await queryOne('SELECT * FROM cdi.escrow_transactions WHERE deal_id=$1', [req.params.dealId]);
  res.json(escrow ?? { status: 'no_escrow' });
});

// POST /escrow/:dealId/mark-condition/:conditionId
escrowRouter.post('/:dealId/mark-condition/:conditionId', ...proMiddleware, async (req: Request, res: Response) => {
  const { evidence } = req.body;
  const escrow = await queryOne<{ id: string; conditions: unknown[] }>(
    'SELECT id, conditions FROM cdi.escrow_transactions WHERE deal_id=$1 AND status IN (\'funded\',\'conditions_checking\')',
    [req.params.dealId]
  );
  if (!escrow) return res.status(404).json({ error: 'No active escrow found' });

  const conditions = (escrow.conditions as Array<Record<string, unknown>>).map(c =>
    c.id === req.params.conditionId ? { ...c, met: true, met_at: new Date().toISOString(), met_by: req.subscriber!.id, evidence } : c
  );

  await query(
    `UPDATE cdi.escrow_transactions SET conditions=$1, status='conditions_checking', updated_at=NOW() WHERE id=$2`,
    [JSON.stringify(conditions), escrow.id]
  );

  await logEvent('escrow.conditions_checked', req.subscriber!.id, req.subscriber!.email, 'escrow', escrow.id, { condition_id: req.params.conditionId }, req);
  await createNotificationForDealParties(req.params.dealId, req.subscriber!.id, 'escrow_funded', 'Condition marked met',
    `${req.subscriber!.name} marked a deal condition as met.`);

  res.json({ message: 'Condition marked as met. System will check if all conditions are satisfied.' });
});

// POST /escrow/:dealId/dispute
escrowRouter.post('/:dealId/dispute', ...proMiddleware, async (req: Request, res: Response) => {
  const { reason } = req.body;
  await query(
    `UPDATE cdi.escrow_transactions SET status='disputed', updated_at=NOW() WHERE deal_id=$1`,
    [req.params.dealId]
  );
  await query(`UPDATE cdi.deals SET status='disputed', updated_at=NOW() WHERE id=$1`, [req.params.dealId]);

  const deal = await queryOne<{ reference: string }>('SELECT reference FROM cdi.deals WHERE id=$1', [req.params.dealId]);
  await createNotificationForDealParties(req.params.dealId, null, 'escrow_disputed', 'Dispute raised',
    `A dispute has been raised on deal ${deal?.reference}: ${reason}`);

  await logEvent('escrow.disputed', req.subscriber!.id, req.subscriber!.email, 'escrow', req.params.dealId, { reason }, req);
  res.json({ message: 'Dispute raised. Admin will review and make a ruling.' });
});
