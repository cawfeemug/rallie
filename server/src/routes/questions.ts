import { Router } from 'express';
import { z } from 'zod';
import { AppError, asyncHandler } from '../errors';
import { hostAuth, participantAuth, requireHost, requireParticipant } from '../middleware/auth';
import { participantLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { Question } from '../models';
import type { Realtime } from '../realtime';
import { questionDto } from '../serializers';
import {
  assertLive,
  assertParticipantFor,
  findOwnedQuestion,
  findQuestion,
  findSession,
} from '../services/lookup';

const MAX_QUESTIONS_PER_PARTICIPANT = 10;

const createSchema = z.object({
  text: z.string().trim().min(3, 'Question must be at least 3 characters').max(280),
  name: z.string().trim().max(40).optional(),
});
const answeredSchema = z.object({ answered: z.boolean() });

export function questionsRouter(realtime: Realtime): Router {
  const r = Router();

  // --- Participant: ask a question -----------------------------------------------------
  r.post(
    '/sessions/:code/questions',
    requireParticipant,
    participantLimiter,
    validate(createSchema),
    asyncHandler(async (req, res) => {
      const auth = participantAuth(req);
      const session = await findSession(req.params.code);
      assertParticipantFor(session, auth);
      assertLive(session);

      const asked = await Question.countDocuments({ session: session._id, authorId: auth.sub });
      if (asked >= MAX_QUESTIONS_PER_PARTICIPANT) {
        throw new AppError(429, 'You have reached the question limit for this session');
      }

      const question = await Question.create({
        session: session._id,
        text: req.body.text,
        authorName: req.body.name || 'Anonymous',
        authorId: auth.sub,
      });
      const dto = questionDto(question);
      realtime.emit(session.code, 'question:created', dto);
      res.status(201).json({ question: { ...dto, upvoted: false } });
    }),
  );

  // --- Participant: toggle an upvote ---------------------------------------------------
  // Each branch is a single atomic update guarded by a filter on the upvoters array, so
  // two quick taps (or two devices) can never double count or drive the counter negative.
  r.post(
    '/questions/:id/upvote',
    requireParticipant,
    participantLimiter,
    asyncHandler(async (req, res) => {
      const auth = participantAuth(req);
      const { question, session } = await findQuestion(req.params.id);
      assertParticipantFor(session, auth);
      assertLive(session);

      let updated = await Question.findOneAndUpdate(
        { _id: question._id, upvoters: { $ne: auth.sub } },
        { $addToSet: { upvoters: auth.sub }, $inc: { upvotes: 1 } },
        { new: true },
      );
      let upvoted = true;
      if (!updated) {
        updated = await Question.findOneAndUpdate(
          { _id: question._id, upvoters: auth.sub },
          { $pull: { upvoters: auth.sub }, $inc: { upvotes: -1 } },
          { new: true },
        );
        upvoted = false;
      }
      if (!updated) throw new AppError(404, 'Question not found');

      const dto = questionDto(updated);
      realtime.emit(session.code, 'question:updated', dto);
      res.json({ question: { ...dto, upvoted }, upvoted });
    }),
  );

  // --- Host: mark answered / unanswered ------------------------------------------------
  r.patch(
    '/questions/:id',
    requireHost,
    validate(answeredSchema),
    asyncHandler(async (req, res) => {
      const { question, session } = await findOwnedQuestion(req.params.id, hostAuth(req).sub);
      question.answered = req.body.answered;
      await question.save();
      const dto = questionDto(question);
      realtime.emit(session.code, 'question:updated', dto);
      res.json({ question: dto });
    }),
  );

  // --- Host: remove a question ---------------------------------------------------------
  r.delete(
    '/questions/:id',
    requireHost,
    asyncHandler(async (req, res) => {
      const { question, session } = await findOwnedQuestion(req.params.id, hostAuth(req).sub);
      await question.deleteOne();
      realtime.emit(session.code, 'question:deleted', { id: String(question._id) });
      res.status(204).end();
    }),
  );

  return r;
}
