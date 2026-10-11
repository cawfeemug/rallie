import type { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from '../errors';

export type HostAuth = { role: 'host'; sub: string };
export type ParticipantAuth = { role: 'participant'; sub: string; code: string };
export type AuthPayload = HostAuth | ParticipantAuth;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

const HOST_TTL_SECONDS = 7 * 24 * 60 * 60;
const PARTICIPANT_TTL_SECONDS = 3 * 24 * 60 * 60;

/** Hosts authenticate with an account; `sub` is the user id. */
export function signHostToken(userId: string): string {
  return jwt.sign({ role: 'host' }, config.jwtSecret, { subject: userId, expiresIn: HOST_TTL_SECONDS });
}

/**
 * Participants are anonymous. The server mints a random voter id and signs it together
 * with the session code, so a token cannot be reused in a different session.
 */
export function signParticipantToken(voterId: string, code: string): string {
  return jwt.sign({ role: 'participant', code }, config.jwtSecret, {
    subject: voterId,
    expiresIn: PARTICIPANT_TTL_SECONDS,
  });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    if (!decoded.sub) return null;
    if (decoded.role === 'host') return { role: 'host', sub: decoded.sub };
    if (decoded.role === 'participant' && typeof decoded.code === 'string') {
      return { role: 'participant', sub: decoded.sub, code: decoded.code };
    }
  } catch {
    // invalid or expired token
  }
  return null;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

/** Attaches `req.auth` when a valid token is present, never rejects. */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = bearerToken(req);
  req.auth = (token ? verifyToken(token) : null) ?? undefined;
  next();
};

export const requireHost: RequestHandler = (req, _res, next) => {
  const token = bearerToken(req);
  const auth = token ? verifyToken(token) : null;
  if (!auth || auth.role !== 'host') throw new AppError(401, 'Please sign in as a host');
  req.auth = auth;
  next();
};

export const requireParticipant: RequestHandler = (req, _res, next) => {
  const token = bearerToken(req);
  const auth = token ? verifyToken(token) : null;
  if (!auth || auth.role !== 'participant') throw new AppError(401, 'Join the session first');
  req.auth = auth;
  next();
};

/** Narrowing helpers for handlers that sit behind requireHost / requireParticipant. */
export function hostAuth(req: Request): HostAuth {
  const auth = req.auth;
  if (!auth || auth.role !== 'host') throw new AppError(401, 'Please sign in as a host');
  return auth;
}

export function participantAuth(req: Request): ParticipantAuth {
  const auth = req.auth;
  if (!auth || auth.role !== 'participant') throw new AppError(401, 'Join the session first');
  return auth;
}
