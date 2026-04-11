import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query, queryOne } from '../db/client.js';
import { logEvent } from '../services/audit.js';
import { createNotification } from '../services/notifications.js';

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
      case 'subscription.create': {
        const { customer, subscription_code, plan, email_token, next_payment_date } = event.data;
        const sub = await getSubByEmail(customer.email);
        if (sub) {
          await query(
            `UPDATE digest.subscriptions SET plan=$1, status='active', paystack_sub_code=$2,
             paystack_email_token=$3, current_period_end=$4, updated_at=NOW()
             WHERE subscriber_id=$5`,
            [planFromCode(plan.plan_code), subscription_code, email_token, next_payment_date, sub.id]
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

async function getSubByEmail(email: string) {
  return queryOne<{ id: string }>('SELECT id FROM digest.subscribers WHERE email=$1', [email]);
}

function planFromCode(code: string): string {
  if (code === process.env.PAYSTACK_PRO_PLAN_CODE) return 'pro';
  if (code === process.env.PAYSTACK_STANDARD_PLAN_CODE) return 'standard';
  if (code === process.env.PAYSTACK_BROKER_PLAN_CODE) return 'broker';
  return 'free';
}

export default router;
