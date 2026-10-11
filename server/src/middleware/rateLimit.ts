import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';

const common = {
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest,
} as const;

const tooMany = { error: 'Too many requests. Please slow down.' };

/** Broad safety net for every API call, per client IP. */
export const apiLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 600, message: tooMany });

/** Brute-force protection for register / login. */
export const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60_000,
  limit: 40,
  message: { error: 'Too many attempts. Try again in a few minutes.' },
});

/** Joining a session mints a token, so cap how fast one IP can do it. */
export const joinLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 120, message: tooMany });

/**
 * Votes, questions and upvotes are limited per participant token, not per IP,
 * because a whole audience often shares one Wi-Fi network (one IP).
 */
export const participantLimiter = rateLimit({
  ...common,
  windowMs: 60_000,
  limit: 40,
  message: tooMany,
  keyGenerator: (req: Request) => `participant:${req.auth?.sub ?? 'unknown'}`,
});
