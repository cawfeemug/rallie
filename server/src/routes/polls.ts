import { Router } from 'express';
import { z } from 'zod';
import { AppError, asyncHandler, isDuplicateKeyError } from '../errors';
import { hostAuth, participantAuth, requireHost, requireParticipant } from '../middleware/auth';
import { participantLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { Poll, Vote } from '../models';
import type { Realtime } from '../realtime';
import { pollDto } from '../serializers';
import { scheduleResults } from '../services/broadcast';
import { assertLive, assertParticipantFor, findOwnedPoll, findOwnedSession, findPoll } from '../services/lookup';
import { emptyResults, getResults } from '../services/results';

const MAX_POLLS_PER_SESSION = 50;

const createSchema = z
  .object({
    question: z.string().trim().min(3, 'Question must be at least 3 characters').max(200),
    type: z.enum(['single', 'multiple']).default('single'),
    options: z
      .array(z.string().trim().min(1, 'Options cannot be empty').max(100))
      .min(2, 'Add at least 2 options')
      .max(10, 'Use at most 10 options'),
  })
  .refine((d) => new Set(d.options.map((o) => o.toLowerCase())).size === d.options.length, {
    message: 'Options must be different from each other',
    path: ['options'],
  });

const statusSchema = z.object({ status: z.enum(['open', 'closed']) });
const voteSchema = z.object({ choices: z.array(z.string().max(20)).min(1, 'Pick at least one option').max(10) });

export function pollsRouter(realtime: Realtime): Router {
  const r = Router();

  // --- Host: create a poll (starts as a draft, invisible to participants) --------------
  r.post(
    '/sessions/:code/polls',
    requireHost,
    validate(createSchema),
    asyncHandler(async (req, res) => {
      const session = await findOwnedSession(req.params.code, hostAuth(req).sub);
      if ((await Poll.countDocuments({ session: session._id })) >= MAX_POLLS_PER_SESSION) {
        throw new AppError(409, `A session can have at most ${MAX_POLLS_PER_SESSION} polls`);
      }
      const poll = await Poll.create({
        session: session._id,
        question: req.body.question,
        type: req.body.type,
        options: (req.body.options as string[]).map((text, i) => ({ id: `o${i}`, text })),
      });
      const dto = pollDto(poll);
      realtime.emit(session.code, 'poll:created', dto, true); // draft: host room only
      res.status(201).json({ poll: { ...dto, results: emptyResults(poll) } });
    }),
  );

  // --- Host: open or close a poll ------------------------------------------------------
  // Only one poll is open at a time, so opening one closes the others. That keeps the
  // projector view and the phone view unambiguous: "the open poll" is always one poll.
  r.patch(
    '/polls/:id',
    requireHost,
    validate(statusSchema),
    asyncHandler(async (req, res) => {
      const { poll, session } = await findOwnedPoll(req.params.id, hostAuth(req).sub);
      const status = req.body.status as 'open' | 'closed';

      if (status === 'open') {
        assertLive(session);
        const others = await Poll.find({ session: session._id, status: 'open', _id: { $ne: poll._id } });
        for (const other of others) {
          other.status = 'closed';
          await other.save();
          realtime.emit(session.code, 'poll:updated', pollDto(other));
        }
      }

      poll.status = status;
      await poll.save();
      const dto = pollDto(poll);
      realtime.emit(session.code, 'poll:updated', dto);
      res.json({ poll: { ...dto, results: await getResults(poll) } });
    }),
  );

  // --- Host: clear all votes on a poll -------------------------------------------------
  r.post(
    '/polls/:id/reset',
    requireHost,
    asyncHandler(async (req, res) => {
      const { poll, session } = await findOwnedPoll(req.params.id, hostAuth(req).sub);
      await Vote.deleteMany({ poll: poll._id });
      const results = emptyResults(poll);
      realtime.emit(session.code, 'poll:reset', results);
      res.json({ results });
    }),
  );

  // --- Host: delete a poll -------------------------------------------------------------
  r.delete(
    '/polls/:id',
    requireHost,
    asyncHandler(async (req, res) => {
      const { poll, session } = await findOwnedPoll(req.params.id, hostAuth(req).sub);
      await Vote.deleteMany({ poll: poll._id });
      await poll.deleteOne();
      realtime.emit(session.code, 'poll:deleted', { id: String(poll._id) });
      res.status(204).end();
    }),
  );

  // --- Participant: vote ---------------------------------------------------------------
  r.post(
    '/polls/:id/vote',
    requireParticipant,
    participantLimiter,
    validate(voteSchema),
    asyncHandler(async (req, res) => {
      const auth = participantAuth(req);
      const { poll, session } = await findPoll(req.params.id);
      assertParticipantFor(session, auth);
      assertLive(session);
      if (poll.status !== 'open') throw new AppError(409, 'This poll is not open for voting');

      const choices = [...new Set(req.body.choices as string[])];
      const valid = new Set(poll.options.map((o) => o.id));
      if (!choices.every((c) => valid.has(c))) throw new AppError(400, 'Unknown option');
      if (poll.type === 'single' && choices.length !== 1) throw new AppError(400, 'Choose exactly one option');

      try {
        await Vote.create({ poll: poll._id, voterId: auth.sub, choices });
      } catch (err) {
        // The unique {poll, voterId} index is the source of truth for "already voted".
        if (isDuplicateKeyError(err)) throw new AppError(409, 'You have already voted on this poll');
        throw err;
      }

      scheduleResults(realtime, session.code, poll);
      res.status(201).json({ choices, results: await getResults(poll) });
    }),
  );

  return r;
}
