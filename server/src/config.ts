import { randomBytes } from 'node:crypto';

const env = process.env;
const nodeEnv = env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

function resolveJwtSecret(): string {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  if (isProd) {
    console.warn(
      '[config] JWT_SECRET is not set. Using a random secret for this run, so logins reset on every restart. ' +
        'Set JWT_SECRET in .env to keep sessions across restarts.',
    );
    return randomBytes(32).toString('hex');
  }
  return 'dev-only-secret-change-me';
}

export const config = {
  nodeEnv,
  isProd,
  isTest,
  port: Number(env.PORT ?? 4000),
  mongoUri: env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/rallie',
  jwtSecret: resolveJwtSecret(),
  bcryptRounds: Number(env.BCRYPT_ROUNDS ?? (isTest ? 4 : 10)),
  // Number of reverse proxies in front of the API (nginx in Docker). Needed so rate limits see real client IPs.
  trustProxy: Number(env.TRUST_PROXY ?? (isProd ? 1 : 0)),
  seedDemo: env.SEED_DEMO === 'true',
} as const;
