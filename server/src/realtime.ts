import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { verifyToken } from './middleware/auth';
import { Session } from './models';
import { normalizeCode } from './services/lookup';

/**
 * The only thing routes know about real time. Keeping it this small makes the HTTP
 * layer easy to test (swap in a recorder) and Socket.IO easy to replace.
 *
 * `hostOnly` events (draft polls) are delivered to the host's private room only.
 */
export interface Realtime {
  emit(code: string, event: string, payload: unknown, hostOnly?: boolean): void;
}

export const noopRealtime: Realtime = { emit() {} };

const CODE_RE = /^[A-Z0-9]{6}$/;
export const sessionRoom = (code: string) => `session:${code}`;
export const hostRoom = (code: string) => `host:${code}`;

export function createRealtime(httpServer: HttpServer): { io: Server; realtime: Realtime } {
  const io = new Server(httpServer, { serveClient: false });

  const viewers = (code: string) => io.sockets.adapter.rooms.get(sessionRoom(code))?.size ?? 0;
  const broadcastPresence = (code: string) => io.to(sessionRoom(code)).emit('presence', { viewers: viewers(code) });

  io.on('connection', (socket) => {
    const joined = new Set<string>();

    // Client -> server: { code, token? }. A valid host token also joins the private host room.
    socket.on('session:join', async (payload: unknown, ack?: (res: { ok: boolean; viewers?: number }) => void) => {
      try {
        const body = (payload ?? {}) as { code?: unknown; token?: unknown };
        const code = typeof body.code === 'string' ? normalizeCode(body.code) : '';
        if (!CODE_RE.test(code)) return ack?.({ ok: false });

        const session = await Session.findOne({ code }).select('host').lean();
        if (!session) return ack?.({ ok: false });

        await socket.join(sessionRoom(code));
        joined.add(code);

        if (typeof body.token === 'string') {
          const auth = verifyToken(body.token);
          if (auth?.role === 'host' && auth.sub === String(session.host)) await socket.join(hostRoom(code));
        }

        broadcastPresence(code);
        ack?.({ ok: true, viewers: viewers(code) });
      } catch (err) {
        console.error('[socket] join failed', err);
        ack?.({ ok: false });
      }
    });

    // Rooms are already left when 'disconnect' fires, so the count is correct here.
    socket.on('disconnect', () => {
      for (const code of joined) broadcastPresence(code);
    });
  });

  const realtime: Realtime = {
    emit(code, event, payload, hostOnly = false) {
      io.to(hostOnly ? hostRoom(code) : sessionRoom(code)).emit(event, payload);
    },
  };

  return { io, realtime };
}
