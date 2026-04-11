import PgBoss from 'pg-boss';
import { query, queryOne } from '../db/client.js';
import { generateDigestCommentary } from './aiService.js';
import { sendDigestEmail } from './email.js';
import { createNotification } from './notifications.js';
import { logEvent } from './audit.js';

let boss: PgBoss | null = null;

export async function startScheduler() {
  boss = new PgBoss(process.env.DATABASE_URL!);

  boss.on('error', (err) => console.error('[pg-boss] Error:', err));

  try {
    await boss.start();
  } catch (err) {
    console.error('[Scheduler] pg-boss failed to start (non-fatal):', err);
    return;
  }

  // ── Daily digest 7:15pm WAT (18:15 UTC) ────────────────────────────────────
  await boss.schedule('compose-daily-digest', '15 18 * * *', {}, { tz: 'Africa/Lagos' });
  await boss.work('compose-daily-digest', async () => {
    const date = new Date().toISOString().split('T')[0];
    console.log(`[Digest] Composing for ${date}`);
    try {
      const pulse = await queryOne<Record<string, unknown>>(
        'SELECT * FROM public.cie_market_pulse WHERE trade_date = $1', [date]
      );
      const topSecurities = await query<Record<string, unknown>>(
        `SELECT sc.ticker, sec.name, sec.sector, sc.ias, sc.rs, sc.cs,
                p.close, ROUND(((p.close - prev.close) / NULLIF(prev.close,0) * 100)::numeric, 2) as change_pct
         FROM public.cie_scores sc
         JOIN public.cie_securities sec ON sec.ticker = sc.ticker
         LEFT JOIN LATERAL (SELECT close FROM public.cie_daily_prices WHERE ticker = sc.ticker AND trade_date = $1 LIMIT 1) p ON TRUE
         LEFT JOIN LATERAL (SELECT close FROM public.cie_daily_prices WHERE ticker = sc.ticker AND trade_date < $1 ORDER BY trade_date DESC LIMIT 1) prev ON TRUE
         WHERE sc.score_date = $1 ORDER BY sc.ias DESC LIMIT 30`, [date]
      );
      const signals = await query<Record<string, unknown>>(
        `SELECT * FROM public.cie_signals WHERE published_at::date = $1 ORDER BY priority DESC LIMIT 10`, [date]
      );

      const commentary = await generateDigestCommentary({ pulse, topSecurities: topSecurities.slice(0, 10), signals });

      await query(
        `INSERT INTO digest.archive (digest_date, market_snapshot, ai_commentary, top_securities, signals)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (digest_date) DO UPDATE SET
           market_snapshot = EXCLUDED.market_snapshot, ai_commentary = EXCLUDED.ai_commentary,
           top_securities = EXCLUDED.top_securities, signals = EXCLUDED.signals, composed_at = NOW()`,
        [date, JSON.stringify(pulse), commentary, JSON.stringify(topSecurities), JSON.stringify(signals)]
      );

      // Dispatch to active subscribers
      const subscribers = await query<Record<string, unknown>>(
        `SELECT s.id, s.email, s.name, sub.plan, p.channels, p.signal_types, p.frequency
         FROM digest.subscribers s
         JOIN digest.subscriptions sub ON sub.subscriber_id = s.id
         JOIN digest.preferences p ON p.subscriber_id = s.id
         WHERE s.email_verified = TRUE AND s.account_status = 'active'
           AND sub.status IN ('active','grace') AND sub.plan != 'free'
           AND (p.frequency = 'daily' OR (p.frequency = 'weekdays' AND EXTRACT(DOW FROM NOW()) BETWEEN 1 AND 5))`
      );

      let sent = 0, failed = 0;
      for (const sub of subscribers) {
        try {
          const html = buildDigestHtml(sub as any, { pulse, topSecurities, signals: signals as any, commentary });
          const [delivery] = await query<{ id: string; open_token: string; unsub_token: string }>(
            `INSERT INTO digest.deliveries (subscriber_id, digest_date, channel, status) VALUES ($1, $2, 'email', 'pending') RETURNING id, open_token, unsub_token`,
            [sub.id, date]
          );
          await sendDigestEmail({ email: sub.email as string, name: sub.name as string, digestHtml: html, openToken: delivery.open_token, unsubToken: delivery.unsub_token, date });
          await query(`UPDATE digest.deliveries SET status='sent', sent_at=NOW() WHERE id=$1`, [delivery.id]);
          sent++;
        } catch (err) {
          failed++;
          console.error(`[Digest] Failed for ${sub.email}:`, err);
        }
      }
      console.log(`[Digest] Done. Sent: ${sent}, Failed: ${failed}`);
    } catch (err) {
      console.error('[Digest] Job failed:', err);
    }
  });

  // ── Check escrow conditions every 5 minutes ─────────────────────────────────
  await boss.schedule('check-escrow-conditions', '*/5 * * * *', {});
  await boss.work('check-escrow-conditions', async () => {
    const escrows = await query<Record<string, unknown>>(
      `SELECT et.*, d.expiry_at, d.commission_pct FROM cdi.escrow_transactions et
       JOIN cdi.deals d ON d.id = et.deal_id
       WHERE et.status IN ('funded','conditions_checking')`
    );

    for (const escrow of escrows) {
      const conditions = escrow.conditions as Array<{ met: boolean }>;
      const allMet = conditions.length > 0 && conditions.every(c => c.met);

      if (allMet) {
        await query(`UPDATE cdi.escrow_transactions SET status='releasing', updated_at=NOW() WHERE id=$1`, [escrow.id]);
        await query(`UPDATE cdi.deals SET status='completed', updated_at=NOW() WHERE id=$1`, [escrow.deal_id]);
        await query(`UPDATE cdi.escrow_transactions SET status='released', released_at=NOW(), release_triggered_by='conditions_met' WHERE id=$1`, [escrow.id]);

        // Calculate commissions
        const parties = await query<Record<string, unknown>>(
          `SELECT dp.subscriber_id, dp.commission_pct FROM cdi.deal_parties dp
           WHERE dp.deal_id = $1 AND dp.commission_pct > 0`, [escrow.deal_id]
        );
        for (const party of parties) {
          const amount = (escrow.amount as number) * (party.commission_pct as number) / 100;
          await query(
            `INSERT INTO cdi.commissions (deal_id, recipient_id, amount, pct) VALUES ($1, $2, $3, $4)`,
            [escrow.deal_id, party.subscriber_id, amount, party.commission_pct]
          );
        }

        // Notify all parties + prompt ratings
        const dealParties = await query<{ subscriber_id: string; name: string }>(
          `SELECT dp.subscriber_id, s.name FROM cdi.deal_parties dp
           JOIN digest.subscribers s ON s.id = dp.subscriber_id
           WHERE dp.deal_id = $1 AND dp.status = 'accepted'`,
          [escrow.deal_id]
        );
        const deal = await queryOne<{ reference: string }>('SELECT reference FROM cdi.deals WHERE id = $1', [escrow.deal_id]);
        for (const party of dealParties) {
          await createNotification(party.subscriber_id, 'deal_completed', 'Deal completed', `Deal ${deal?.reference} has been completed and funds released.`, 'deal', escrow.deal_id as string);
          await createNotification(party.subscriber_id, 'rating_prompt', 'Rate your counterparty', `How was your experience on deal ${deal?.reference}? Take a moment to leave a rating.`, 'deal', escrow.deal_id as string);
        }
        await logEvent('escrow.released', null, null, 'escrow', escrow.id as string, { trigger: 'conditions_met', amount: escrow.amount });
      }

      // Check timeout
      if (escrow.expiry_at && new Date(escrow.expiry_at as string) < new Date()) {
        await query(`UPDATE cdi.escrow_transactions SET status='refunding', updated_at=NOW() WHERE id=$1`, [escrow.id]);
        await query(`UPDATE cdi.escrow_transactions SET status='refunded', refunded_at=NOW(), release_triggered_by='timeout' WHERE id=$1`, [escrow.id]);
        await query(`UPDATE cdi.deals SET status='expired', updated_at=NOW() WHERE id=$1`, [escrow.deal_id]);
        await logEvent('escrow.refunded', null, null, 'escrow', escrow.id as string, { trigger: 'timeout' });
      }
    }
  });

  // ── Weekly free summary Sunday 7pm WAT ──────────────────────────────────────
  await boss.schedule('weekly-free-summary', '0 18 * * 0', {}, { tz: 'Africa/Lagos' });
  await boss.work('weekly-free-summary', async () => {
    console.log('[Weekly] Sending free tier summaries');
    // Implementation similar to daily but limited content
  });

  // ── Midnight subscription check ─────────────────────────────────────────────
  await boss.schedule('subscription-renewal-check', '0 0 * * *', {}, { tz: 'Africa/Lagos' });
  await boss.work('subscription-renewal-check', async () => {
    await query(
      `UPDATE digest.subscriptions SET plan='free', status='active', paystack_sub_code=NULL,
       current_period_end=NULL, grace_until=NULL WHERE status='grace' AND grace_until < NOW()`
    );
  });

  console.log('[Scheduler] All jobs registered');
}

function buildDigestHtml(sub: { plan: string }, data: {
  pulse: Record<string, unknown> | null;
  topSecurities: Record<string, unknown>[];
  signals: Array<{ ticker?: string; headline: string; priority: string; type?: string }>;
  commentary: string;
}): string {
  const { pulse, topSecurities, signals, commentary } = data;
  const limit = sub.plan === 'free' ? 5 : 30;
  const ms = pulse as Record<string, number> | null;

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">
<div style="background:#0f1117;border-radius:12px 12px 0 0;padding:28px 32px;margin-bottom:2px">
  <p style="margin:0 0 4px;font-size:11px;color:#888;letter-spacing:0.1em;text-transform:uppercase">Aprisys Market Digest</p>
  <p style="margin:0;font-size:18px;font-weight:600;color:#fff">${new Date().toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
  <p style="margin:6px 0 0;font-size:13px;color:#888">Good evening, {{SUBSCRIBER_NAME}}</p>
</div>
${ms ? `<div style="background:#fff;padding:24px 32px;margin-bottom:2px;border:1px solid #e5e4e0">
  <p style="margin:0 0 12px;font-size:11px;color:#aaa;text-transform:uppercase;letter-spacing:0.07em">Market snapshot</p>
  <p style="margin:0;font-size:24px;font-weight:700;color:#1a1a1a">${(ms.asi || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })}</p>
  <p style="margin:2px 0 12px;font-size:14px;color:${(ms.asi_change_pct || 0) >= 0 ? '#15803d' : '#dc2626'}">${(ms.asi_change_pct || 0) >= 0 ? '▲' : '▼'} ${Math.abs(ms.asi_change_pct || 0).toFixed(2)}%</p>
  <p style="font-size:12px;color:#888">Advancing: ${ms.advancing} &bull; Declining: ${ms.declining} &bull; Turnover: ₦${((ms.turnover || 0)/1e9).toFixed(2)}B</p>
</div>` : ''}
${sub.plan !== 'free' && commentary ? `<div style="background:#fff;padding:24px 32px;margin-bottom:2px;border:1px solid #e5e4e0">
  <p style="margin:0 0 12px;font-size:11px;color:#aaa;text-transform:uppercase;letter-spacing:0.07em">AI market commentary</p>
  <p style="margin:0;font-size:14px;color:#333;line-height:1.7">${commentary}</p>
  <p style="margin:12px 0 0;font-size:11px;color:#bbb;font-style:italic">Generated by Aprisys intelligence engine. Not investment advice.</p>
</div>` : ''}
<div style="background:#fff;padding:24px 32px;margin-bottom:2px;border:1px solid #e5e4e0">
  <p style="margin:0 0 16px;font-size:11px;color:#aaa;text-transform:uppercase;letter-spacing:0.07em">Top securities by IAS score</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <tr style="border-bottom:1px solid #f0efeb"><th style="text-align:left;padding:0 0 8px;color:#aaa;font-weight:400">Ticker</th><th style="text-align:right;padding:0 0 8px;color:#aaa;font-weight:400">IAS</th><th style="text-align:right;padding:0 0 8px;color:#aaa;font-weight:400">Close</th><th style="text-align:right;padding:0 0 8px;color:#aaa;font-weight:400">Chg</th></tr>
    ${topSecurities.slice(0, limit).map((s: Record<string, unknown>, i) => {
      const chg = (s.change_pct as number) ?? 0;
      return `<tr style="border-bottom:1px solid #f8f7f4"><td style="padding:8px 0">${i+1}. <strong>${s.ticker}</strong></td><td style="text-align:right;font-weight:600">${(s.ias as number)?.toFixed(1)}</td><td style="text-align:right">₦${(s.close as number)?.toFixed(2)}</td><td style="text-align:right;color:${chg>=0?'#15803d':'#dc2626'}">${chg>=0?'+':''}${chg.toFixed(2)}%</td></tr>`;
    }).join('')}
  </table>
</div>
<div style="background:#0f1117;border-radius:0 0 12px 12px;padding:20px 32px">
  <p style="margin:0;font-size:11px;color:#555;line-height:1.6">Aprisys — Powered by Cellion One Ltd &bull; Not investment advice.<br>
  <a href="{{UNSUB_URL}}" style="color:#555">Unsubscribe</a> &bull; <a href="${process.env.FRONTEND_URL}/retail/settings" style="color:#555">Preferences</a></p>
</div>
</div></body></html>`;
}
