import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { AppError, asyncHandler, isDuplicateKeyError } from '../errors';
import { hostAuth, optionalAuth, requireHost, signParticipantToken } from '../middleware/auth';
import { joinLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { Poll, Question, Session, Vote } from '../models';
import type { Realtime } from '../realtime';
import { pollDto, questionDto, sessionDto } from '../serializers';
import { generateCode } from '../services/code';
import { findOwnedSession, findSession } from '../services/lookup';
import { getResultsMany } from '../services/results';

const titleSchema = z.string().trim().min(3, 'Title must be at least 3 characters').max(120);
const createSchema = z.object({ title: titleSchema });
const updateSchema = z
  .object({ title: titleSchema.optional(), status: z.enum(['live', 'ended']).optional() })
  .refine((d) => d.title !== undefined || d.status !== undefined, { message: 'Nothing to update' });

type CountRow = { _id: Types.ObjectId; n: number };

export function sessionsRouter(realtime: Realtime): Router {
  const r = Router();

  // --- Host: create a session ---------------------------------------------------------
  r.post(
    '/',
    requireHost,
    validate(createSchema),
    asyncHandler(async (req, res) => {
      const host = hostAuth(req);
      // Codes are random, so a collision is unlikely but possible: retry on the unique index.
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const session = await Session.create({ code: generateCode(), title: req.body.title, host: host.sub });
          res.status(201).json({ session: sessionDto(session) });
          return;
        } catch (err) {
          if (!isDuplicateKeyError(err)) throw err;
        }
      }
      throw new AppError(500, 'Could not allocate a join code, please try again');
    }),
  );

  // --- Host: list my sessions with poll / question counts -----------------------------
  r.get(
    '/',
    requireHost,
    asyncHandler(async (req, res) => {
      const host = hostAuth(req);
      const sessions = await Session.find({ host: host.sub }).sort({ createdAt: -1 }).limit(100).lean();
      const ids = sessions.map((s) => s._id);
      const group = [{ $match: { session: { $in: ids } } }, { $group: { _id: '$session', n: { $sum: 1 } } }];
      const [pollCounts, questionCounts] = await Promise.all([
        Poll.aggregate<CountRow>(group),
        Question.aggregate<CountRow>(group),
      ]);
      const polls = new Map(pollCounts.map((c) => [String(c._id), c.n]));
      const questions = new Map(questionCounts.map((c) => [String(c._id), c.n]));
      res.json({
        sessions: sessions.map((s) => ({
          ...sessionDto(s),
          pollCount: polls.get(String(s._id)) ?? 0,
          questionCount: questions.get(String(s._id)) ?? 0,
        })),
      });
    }),
  );

  // --- Public: full snapshot of a session ---------------------------------------------
  // One request returns everything a screen needs. The same endpoint serves the host (who
  // also sees drafts), participants (who also get their own votes) and the projector view.
  r.get(
    '/:code',
    optionalAuth,
    asyncHandler(async (req, res) => {
      const session = await findSession(req.params.code);
      const auth = req.auth;
      const isHost = auth?.role === 'host' && auth.sub === String(session.host);
      const voterId = auth?.role === 'participant' && auth.code === session.code ? auth.sub : null;

      const pollFilter = isHost ? { session: session._id } : { session: session._id, status: { $ne: 'draft' } };
      const [polls, questions] = await Promise.all([
        Poll.find(pollFilter).sort({ createdAt: 1 }).lean(),
        Question.find({ session: session._id })
          .select('+upvoters')
          .sort({ answered: 1, upvotes: -1, createdAt: 1 })
          .limit(200)
          .lean(),
      ]);

      const results = await getResultsMany(polls);

      const myVotes: Record<string, string[]> = {};
      if (voterId && polls.length > 0) {
        const votes = await Vote.find({ poll: { $in: polls.map((p) => p._id) }, voterId }).lean();
        for (const v of votes) myVotes[String(v.poll)] = v.choices;
      }

      res.json({
        session: { code: session.code, title: session.title, status: session.status },
        isHost,
        polls: polls.map((p) => ({ ...pollDto(p), results: results.get(String(p._id)) })),
        questions: questions.map((q) => ({
          ...questionDto(q),
          upvoted: voterId ? (q.upvoters ?? []).includes(voterId) : false,
        })),
        myVotes,
      });
    }),
  );

  // --- Host: rename or end/resume ------------------------------------------------------
  r.patch(
    '/:code',
    requireHost,
    validate(updateSchema),
    asyncHandler(async (req, res) => {
      const session = await findOwnedSession(req.params.code, hostAuth(req).sub);
      if (req.body.title !== undefined) session.title = req.body.title;
      if (req.body.status !== undefined) session.status = req.body.status;
      await session.save();
      realtime.emit(session.code, 'session:updated', { title: session.title, status: session.status });
      res.json({ session: sessionDto(session) });
    }),
  );

  // --- Host: delete everything in a session -------------------------------------------
  r.delete(
    '/:code',
    requireHost,
    asyncHandler(async (req, res) => {
      const session = await findOwnedSession(req.params.code, hostAuth(req).sub);
      const pollIds = (await Poll.find({ session: session._id }).select('_id').lean()).map((p) => p._id);
      await Promise.all([
        Vote.deleteMany({ poll: { $in: pollIds } }),
        Poll.deleteMany({ session: session._id }),
        Question.deleteMany({ session: session._id }),
      ]);
      await session.deleteOne();
      realtime.emit(session.code, 'session:deleted', {});
      res.status(204).end();
    }),
  );

  // --- Participant: join anonymously ---------------------------------------------------
  // The server mints the voter id. Because it is signed into the token, a client cannot
  // choose or forge an identity, and a token only works for this one session.
  r.post(
    '/:code/join',
    joinLimiter,
    asyncHandler(async (req, res) => {
      const session = await findSession(req.params.code);
      const voterId = randomUUID();
      res.status(201).json({
        token: signParticipantToken(voterId, session.code),
        voterId,
        session: { code: session.code, title: session.title, status: session.status },
      });
    }),
  );

  return r;
}
