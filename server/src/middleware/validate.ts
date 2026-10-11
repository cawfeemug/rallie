import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

/**
 * Validates and normalises req.body with a Zod schema (trimming, defaults, etc.).
 * A ZodError is thrown to the central error handler, which turns it into a 400.
 */
export function validate(schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    req.body = schema.parse(req.body ?? {});
    next();
  };
}
