import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { config } from './config';
import { errorHandler, notFoundHandler } from './errors';
import { apiLimiter } from './middleware/rateLimit';
import { noopRealtime, type Realtime } from './realtime';
import { authRouter } from './routes/auth';
import { pollsRouter } from './routes/polls';
import { questionsRouter } from './routes/questions';
import { sessionsRouter } from './routes/sessions';

/** Builds the Express app. Realtime is injected so tests can run without Socket.IO. */
export function createApp(realtime: Realtime = noopRealtime) {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '20kb' }));

  // Registered before the rate limiter so container health checks are never throttled.
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      db: mongoose.connection.readyState === 1,
      demo: config.seedDemo,
      uptime: Math.round(process.uptime()),
    });
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRouter());
  app.use('/api/sessions', sessionsRouter(realtime));
  app.use('/api', pollsRouter(realtime));
  app.use('/api', questionsRouter(realtime));
  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
