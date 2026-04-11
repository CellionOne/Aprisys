import { query } from '../db/client.js';
import { NotificationType } from '../types/index.js';

export async function createNotification(
  subscriber_id: string,
  type: NotificationType,
  title: string,
  body: string,
  entity_type?: string,
  entity_id?: string
): Promise<void> {
  try {
    await query(
      `INSERT INTO digest.notifications (subscriber_id, type, title, body, entity_type, entity_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [subscriber_id, type, title, body, entity_type ?? null, entity_id ?? null]
    );
  } catch (err) {
    console.error('[Notifications] Failed to create notification:', err);
  }
}

export async function createNotificationForDealParties(
  deal_id: string,
  exclude_subscriber_id: string | null,
  type: NotificationType,
  title: string,
  body: string
): Promise<void> {
  try {
    const parties = await query<{ subscriber_id: string }>(
      `SELECT subscriber_id FROM cdi.deal_parties
       WHERE deal_id = $1 AND status = 'accepted' AND subscriber_id != $2`,
      [deal_id, exclude_subscriber_id ?? '00000000-0000-0000-0000-000000000000']
    );
    for (const party of parties) {
      await createNotification(party.subscriber_id, type, title, body, 'deal', deal_id);
    }
  } catch (err) {
    console.error('[Notifications] Failed to notify deal parties:', err);
  }
}
