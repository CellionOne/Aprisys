import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'http';
import { query, queryOne } from '../db/client.js';
import { logEvent } from '../services/audit.js';

type AuthenticatedSocket = WebSocket & {
  subscriberId?: string;
  subscriberName?: string;
  accountType?: string;
  dealId?: string;
  isAdmin?: boolean;
};

// Map of dealId -> Map of subscriberId -> socket
const rooms = new Map<string, Map<string, AuthenticatedSocket>>();

function broadcast(dealId: string, excludeId: string | null, message: object) {
  const room = rooms.get(dealId);
  if (!room) return;
  const payload = JSON.stringify(message);
  room.forEach((socket, subscriberId) => {
    if (subscriberId !== excludeId && socket.readyState === WebSocket.OPEN) {
      socket.send(payload);
    }
  });
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws: AuthenticatedSocket, req: IncomingMessage) => {
    try {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      const dealId = url.pathname.split('/').filter(Boolean)[1]; // /ws/deals/:dealId

      if (!token || !dealId) {
        ws.send(JSON.stringify({ type: 'auth_error', message: 'Token and deal ID required' }));
        ws.close();
        return;
      }

      // Verify JWT
      let payload: { sub: string };
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string };
      } catch (err: any) {
        ws.send(JSON.stringify({ type: 'auth_error', message: err.name === 'TokenExpiredError' ? 'Token expired. Please refresh.' : 'Invalid token' }));
        ws.close();
        return;
      }

      // Get subscriber
      const subscriber = await queryOne<{ id: string; name: string; account_type: string; account_status: string; is_admin: boolean }>(
        'SELECT id, name, account_type, account_status, is_admin FROM digest.subscribers WHERE id=$1',
        [payload.sub]
      );

      if (!subscriber || subscriber.account_status !== 'active') {
        ws.send(JSON.stringify({ type: 'auth_error', message: 'Account not active' }));
        ws.close();
        return;
      }

      // Verify deal access - must be a party OR admin
      const party = await queryOne(
        'SELECT id FROM cdi.deal_parties WHERE deal_id=$1 AND subscriber_id=$2',
        [dealId, subscriber.id]
      );

      if (!party && !subscriber.is_admin) {
        ws.send(JSON.stringify({ type: 'auth_error', message: 'Not a party to this deal' }));
        ws.close();
        return;
      }

      ws.subscriberId = subscriber.id;
      ws.subscriberName = subscriber.name;
      ws.accountType = subscriber.account_type;
      ws.dealId = dealId;
      ws.isAdmin = subscriber.is_admin;

      // Add to room
      if (!rooms.has(dealId)) rooms.set(dealId, new Map());
      rooms.get(dealId)!.set(subscriber.id, ws);

      // Send last 50 messages on connect
      const messages = await query(
        `SELECT dm.*, s.name as sender_name, s.account_type as sender_account_type, s.kyc_status as sender_kyc_status
         FROM cdi.deal_messages dm JOIN digest.subscribers s ON s.id=dm.sender_id
         WHERE dm.deal_id=$1 ORDER BY dm.created_at DESC LIMIT 50`,
        [dealId]
      );
      ws.send(JSON.stringify({ type: 'history', payload: messages.reverse() }));

      // Broadcast join to others (not for admin)
      if (!subscriber.is_admin) {
        broadcast(dealId, subscriber.id, {
          type: 'party_joined',
          payload: { subscriber_id: subscriber.id, name: subscriber.name, account_type: subscriber.account_type },
          timestamp: new Date().toISOString(),
        });
      } else {
        // Log admin observation silently
        await logEvent('admin_deal_room.viewed', subscriber.id, null, 'deal', dealId, {});
      }

      // Handle incoming messages
      ws.on('message', async (data) => {
        try {
          const { message, message_type = 'text', metadata } = JSON.parse(data.toString());
          if (!message?.trim()) return;

          const [saved] = await query<{ id: string; created_at: string }>(
            `INSERT INTO cdi.deal_messages (deal_id, sender_id, message, message_type, metadata)
             VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
            [dealId, subscriber.id, message.trim(), message_type, metadata ? JSON.stringify(metadata) : null]
          );

          const outbound = {
            type: 'message',
            payload: {
              id: saved.id,
              deal_id: dealId,
              message: message.trim(),
              message_type,
              metadata: metadata ?? null,
              created_at: saved.created_at,
            },
            sender: { id: subscriber.id, name: subscriber.name, account_type: subscriber.account_type },
            timestamp: saved.created_at,
          };

          // Send back to sender too
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(outbound));
          broadcast(dealId, subscriber.id, outbound);

          await logEvent('deal_room.message_sent', subscriber.id, null, 'deal', dealId, { message_type });
        } catch (err) {
          console.error('[WS] Message handling error:', err);
        }
      });

      ws.on('close', async () => {
        rooms.get(dealId)?.delete(subscriber.id);
        if (rooms.get(dealId)?.size === 0) rooms.delete(dealId);

        if (!subscriber.is_admin) {
          broadcast(dealId, subscriber.id, {
            type: 'party_left',
            payload: { name: subscriber.name },
            timestamp: new Date().toISOString(),
          });
        }
      });

      ws.on('error', (err) => console.error('[WS] Socket error:', err));

    } catch (err) {
      console.error('[WS] Connection error:', err);
      ws.close();
    }
  });

  console.log('[WS] WebSocket server ready at /ws/deals/:dealId');
  return wss;
}

// Utility to send escrow updates to deal room
export function broadcastEscrowUpdate(dealId: string, status: string, amount: number) {
  broadcast(dealId, null, {
    type: 'escrow_update',
    payload: { status, amount },
    timestamp: new Date().toISOString(),
  });
}
