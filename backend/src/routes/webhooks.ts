import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query, queryOne } from '../db/client.js';
import { logEvent } from '../services/audit.js';
import { createNotification } from '../services/notifications.js';
import { sendKycApprovedEmail, sendKycRejectedEmail, sendSubscriptionConfirmationEmail } from '../services/email.js';

const router = Router();

router.post('/paystack', async (req: Request, res: Response) => {
  const sig = req.headers['x-paystack-signature'] as string;
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_WEBHOOK_SECRET!)
    .update(req.body as Buffer)
    .digest('hex');

  if (hash !== sig) return res.status(401).send('Invalid signature');

  const event = JSON.parse((req.body as Buffer).toString());
  console.log(`[Webhook] Paystack: ${event.event}`);

  await logEvent('webhook.paystack', null, null, null, null, { event_type: event.event, reference: event.data?.reference });

  try {
    switch (event.event) {
      case 'charge.success': {
        const meta = event.data?.metadata as Record<string, string> | undefined;
        if (meta?.type !== 'subscription') break;
        const { subscriber_id, plan } = meta;
        if (!subscriber_id || !plan) break;

        const periodEnd = new Date(Date.now() + 30 * 24 * 3600_000);
        await query(
          `UPDATE digest.subscriptions
           SET plan=$1, status='active', current_period_end=$2,
               paystack_sub_code=NULL, paystack_email_token=NULL, updated_at=NOW()
           WHERE subscriber_id=$3`,
          [plan, periodEnd, subscriber_id]
        );

        const sub = await queryOne<{ email: string; name: string }>(
          'SELECT email, name FROM digest.subscribers WHERE id=$1', [subscriber_id]
        );
        if (sub) {
          try { await sendSubscriptionConfirmationEmail(sub.email, sub.name, plan); } catch (_) {}
          const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
          await createNotification(
            subscriber_id, 'subscription_activated',
            `${planLabel} plan activated`,
            `Your Aprisys ${plan} subscription is now active. Enjoy full access.`
          );
        }
        break;
      }
      case 'subscription.create': {
        // Retained for backwards compatibility with any existing Paystack subscription plans
        const { customer, subscription_code, plan, email_token, next_payment_date } = event.data;
        const sub = await getSubByEmail(customer.email);
        if (sub && plan?.name) {
          const planName = plan.name.toLowerCase().replace(' ', '_');
          await query(
            `UPDATE digest.subscriptions SET plan=$1, status='active', paystack_sub_code=$2,
             paystack_email_token=$3, current_period_end=$4, updated_at=NOW()
             WHERE subscriber_id=$5`,
            [planName, subscription_code, email_token, next_payment_date, sub.id]
          );
        }
        break;
      }
      case 'invoice.payment_failed': {
        const { customer } = event.data;
        const sub = await getSubByEmail(customer.email);
        if (sub) {
          const grace = new Date(Date.now() + 7 * 24 * 3600_000);
          await query(
            `UPDATE digest.subscriptions SET status='grace', grace_until=$1, updated_at=NOW() WHERE subscriber_id=$2`,
            [grace, sub.id]
          );
          await createNotification(sub.id, 'account_suspended', 'Payment failed',
            'Your payment failed. You have a 7-day grace period before your plan is downgraded. Please update your payment method.');
        }
        break;
      }
      case 'invoice.update': {
        if (event.data.paid) {
          const { customer, subscription } = event.data;
          const sub = await getSubByEmail(customer.email);
          if (sub) {
            await query(
              `UPDATE digest.subscriptions SET status='active', current_period_end=$1, grace_until=NULL, updated_at=NOW()
               WHERE subscriber_id=$2`,
              [subscription?.next_payment_date ?? null, sub.id]
            );
          }
        }
        break;
      }
      case 'subscription.disable': {
        const { customer } = event.data;
        const sub = await getSubByEmail(customer.email);
        if (sub) {
          await query(
            `UPDATE digest.subscriptions SET plan='free', status='active', paystack_sub_code=NULL,
             paystack_email_token=NULL, current_period_end=NULL, updated_at=NOW()
             WHERE subscriber_id=$1`,
            [sub.id]
          );
        }
        break;
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('[Webhook] Processing error:', err);
    res.sendStatus(500);
  }
});

router.post('/cellion', async (req: Request, res: Response) => {
  const sig = req.headers['x-cellion-signature'] as string | undefined;
  const secret = process.env.CELLION_WEBHOOK_SECRET;

  if (secret && sig) {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(req.body as Buffer)
      .digest('hex');
    if (expected !== sig) return res.status(401).send('Invalid signature');
  } else if (!secret) {
    console.warn('[Webhook] CELLION_WEBHOOK_SECRET not set — skipping signature verification');
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse((req.body as Buffer).toString());
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const eventType = event.event as string;
  console.log(`[Webhook] Cellion: ${eventType}`);
  await logEvent('webhook.cellion', null, null, 'kyc', null, { event_type: eventType });

  res.sendStatus(200); // Acknowledge immediately

  try {
    if (eventType === 'verification.completed') {
      const data = event.data as Record<string, unknown>;
      const requestId = data?.requestId as string | undefined;
      const status = data?.status as string | undefined;
      const rejectionReason = data?.rejectionReason as string | undefined;

      if (!requestId) return;

      // Find the kyc_record whose review_notes contains this requestId
      const kycRecord = await queryOne<{ id: string; subscriber_id: string }>(
        `SELECT id, subscriber_id FROM digest.kyc_records
         WHERE review_notes ILIKE $1 ORDER BY submitted_at DESC LIMIT 1`,
        [`%${requestId}%`]
      );

      if (!kycRecord) {
        console.warn(`[Webhook] Cellion: no KYC record found for requestId=${requestId}`);
        return;
      }

      const sub = await queryOne<{ email: string; name: string; account_type: string }>(
        'SELECT email, name, account_type FROM digest.subscribers WHERE id=$1',
        [kycRecord.subscriber_id]
      );

      if (status === 'verified' || status === 'approved') {
        await query(
          `UPDATE digest.kyc_records SET status='verified', verified_at=NOW(),
           review_notes=review_notes || ' | webhook_confirmed' WHERE id=$1`,
          [kycRecord.id]
        );
        await query(`UPDATE digest.subscribers SET kyc_status='verified' WHERE id=$1`, [kycRecord.subscriber_id]);
        if (sub) {
          try { await sendKycApprovedEmail(sub.email, sub.name, sub.account_type); } catch (_) {}
          await createNotification(kycRecord.subscriber_id, 'kyc_approved', 'Account verified',
            'Your biometric verification is complete. You can now access all platform features.', 'kyc', kycRecord.id);
        }
        await logEvent('kyc.approved', null, sub?.email ?? null, 'kyc', kycRecord.id,
          { source: 'cellion_webhook', requestId, status });
      } else if (status === 'failed' || status === 'rejected') {
        const reason = rejectionReason ?? 'Biometric verification failed';
        await query(
          `UPDATE digest.kyc_records SET status='rejected', rejection_reason=$1,
           review_notes=review_notes || ' | webhook_rejected' WHERE id=$2`,
          [reason, kycRecord.id]
        );
        await query(`UPDATE digest.subscribers SET kyc_status='rejected' WHERE id=$1`, [kycRecord.subscriber_id]);
        if (sub) {
          try { await sendKycRejectedEmail(sub.email, sub.name, reason); } catch (_) {}
          await createNotification(kycRecord.subscriber_id, 'kyc_rejected', 'Verification unsuccessful',
            `Your biometric verification was not approved: ${reason}`, 'kyc', kycRecord.id);
        }
        await logEvent('kyc.rejected', null, sub?.email ?? null, 'kyc', kycRecord.id,
          { source: 'cellion_webhook', requestId, status, reason });
      }
    }
  } catch (err) {
    console.error('[Webhook] Cellion processing error:', err);
  }
});

async function getSubByEmail(email: string) {
  return queryOne<{ id: string }>('SELECT id FROM digest.subscribers WHERE email=$1', [email]);
}

export default router;
