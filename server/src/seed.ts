import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { config } from './config';
import { initModels, Poll, Question, Session, User, Vote } from './models';

export const DEMO_EMAIL = 'demo@rallie.dev';
export const DEMO_PASSWORD = 'demo1234';
export const DEMO_CODE = 'DEMO42';

const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

async function wipeSession(sessionId: mongoose.Types.ObjectId): Promise<void> {
  const pollIds = (await Poll.find({ session: sessionId }).select('_id').lean()).map((p) => p._id);
  await Promise.all([
    Vote.deleteMany({ poll: { $in: pollIds } }),
    Poll.deleteMany({ session: sessionId }),
    Question.deleteMany({ session: sessionId }),
  ]);
  await Session.deleteOne({ _id: sessionId });
}

/**
 * Creates a ready-to-demo session (code DEMO42) with realistic votes and questions, so the
 * app never opens to an empty screen in front of an interviewer. Safe to call repeatedly.
 */
export async function seedDemo({ reset = false }: { reset?: boolean } = {}): Promise<{ created: boolean }> {
  let user = await User.findOne({ email: DEMO_EMAIL });
  if (!user) {
    user = await User.create({
      name: 'Demo Host',
      email: DEMO_EMAIL,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, config.bcryptRounds),
    });
  }

  const existing = await Session.findOne({ code: DEMO_CODE });
  if (existing && !reset) return { created: false };
  if (existing) await wipeSession(existing._id);

  const session = await Session.create({ code: DEMO_CODE, title: 'Rallie Live Demo', host: user._id });
  const opt = (texts: string[]) => texts.map((text, i) => ({ id: `o${i}`, text }));

  const [stackPoll, usedPoll] = await Poll.create([
    {
      session: session._id,
      question: 'Which part of the stack should I walk you through first?',
      type: 'single',
      status: 'open',
      options: opt(['React + TypeScript frontend', 'Node + Express API', 'MongoDB aggregation pipelines', 'Docker + deployment']),
    },
    {
      session: session._id,
      question: 'Which of these have you used in production?',
      type: 'multiple',
      status: 'closed',
      options: opt(['React', 'TypeScript', 'MongoDB', 'Docker', 'WebSockets']),
    },
    {
      session: session._id,
      question: 'How would you stop one person voting twice?',
      type: 'single',
      status: 'draft',
      options: opt(['Require login', 'Unique index on (poll, voter)', 'IP address check', 'Browser fingerprint']),
    },
  ]);

  // Poll 1: weighted single-choice votes from 36 fake voters.
  const weighted = ['o0', 'o0', 'o0', 'o0', 'o1', 'o1', 'o1', 'o2', 'o2', 'o2', 'o2', 'o2', 'o3', 'o3'];
  await Vote.insertMany(
    Array.from({ length: 36 }, (_, i) => ({ poll: stackPoll._id, voterId: `seed-a-${i}`, choices: [pick(weighted)] })),
  );

  // Poll 2: multi-choice, each fake voter ticks each option with a different probability.
  const odds = [0.8, 0.65, 0.5, 0.45, 0.3];
  const multi = Array.from({ length: 28 }, (_, i) => ({
    poll: usedPoll._id,
    voterId: `seed-b-${i}`,
    choices: odds.map((p, idx) => (Math.random() < p ? `o${idx}` : null)).filter((c): c is string => c !== null),
  })).filter((v) => v.choices.length > 0);
  await Vote.insertMany(multi);

  const questions = [
    { text: 'How do you prevent the same person voting twice?', upvotes: 14, answered: false },
    { text: 'Why Socket.IO instead of plain WebSockets?', upvotes: 9, answered: false },
    { text: 'How would this scale beyond a single server instance?', upvotes: 7, answered: true },
    { text: 'Can the demo data be reset between sessions?', upvotes: 3, answered: false },
  ];
  await Question.insertMany(
    questions.map((q, i) => ({
      session: session._id,
      text: q.text,
      authorName: i % 2 === 0 ? 'Anonymous' : 'Alex',
      authorId: `seed-author-${i}`,
      upvoters: Array.from({ length: q.upvotes }, (_, n) => `seed-up-${i}-${n}`),
      upvotes: q.upvotes,
      answered: q.answered,
    })),
  );

  return { created: true };
}

// `npm run seed` (or `node dist/seed.js` inside the container) wipes and recreates the demo session.
if (require.main === module) {
  (async () => {
    await mongoose.connect(config.mongoUri);
    await initModels();
    await seedDemo({ reset: true });
    console.log(`Demo ready. Join code ${DEMO_CODE} | host login ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    await mongoose.disconnect();
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
