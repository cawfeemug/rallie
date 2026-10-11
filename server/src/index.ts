import http from 'node:http';
import mongoose from 'mongoose';
import { createApp } from './app';
import { config } from './config';
import { initModels } from './models';
import { createRealtime } from './realtime';
import { seedDemo } from './seed';

async function main(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri);
  await initModels();
  console.log('[db] connected');

  if (config.seedDemo) {
    const { created } = await seedDemo({ reset: false });
    console.log(created ? '[seed] demo data created' : '[seed] demo data already present');
  }

  // Socket.IO must attach to the HTTP server before the Express handler is registered on it,
  // otherwise Express would answer (404) the /socket.io/ requests first. The indirection below
  // lets us create the server first and plug the app in once Socket.IO is attached.
  let handler: http.RequestListener = (_req, res) => {
    res.statusCode = 503;
    res.end();
  };
  const server = http.createServer((req, res) => handler(req, res));
  const { io, realtime } = createRealtime(server);
  handler = createApp(realtime);

  server.listen(config.port, () => {
    console.log(`[http] Rallie API listening on :${config.port} (${config.nodeEnv})`);
  });

  const shutdown = (signal: string) => {
    console.log(`[${signal}] shutting down`);
    io.close(() => {
      server.close(() => {
        void mongoose.disconnect().finally(() => process.exit(0));
      });
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
