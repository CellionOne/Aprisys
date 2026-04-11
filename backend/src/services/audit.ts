import { Request } from 'express';
import { query } from '../db/client.js';

export async function logEvent(
  event_type: string,
  actor_id: string | null,
  actor_email: string | null,
  entity_type: string | null,
  entity_id: string | null,
  payload: Record<string, unknown> | null,
  req?: Request
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit.events (event_type, actor_id, actor_email, entity_type, entity_id, payload, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event_type,
        actor_id,
        actor_email,
        entity_type,
        entity_id,
        payload ? JSON.stringify(payload) : null,
        req?.ip ?? req?.headers['x-forwarded-for'] ?? null,
        req?.headers['user-agent'] ?? null,
      ]
    );
  } catch (err) {
    console.error('[Audit] Failed to log event:', event_type, err);
  }
}
