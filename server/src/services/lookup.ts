import { Types } from 'mongoose';
import { AppError } from '../errors';
import type { ParticipantAuth } from '../middleware/auth';
import { Poll, Question, Session } from '../models';

const CODE_RE = /^[A-Z0-9]{6}$/;

export const normalizeCode = (raw: string): string => raw.trim().toUpperCase();

function assertId(id: string, label: string): void {
  if (!Types.ObjectId.isValid(id)) throw new AppError(404, `${label} not found`);
}

export async function findSession(rawCode: string) {
  const code = normalizeCode(rawCode);
  const session = CODE_RE.test(code) ? await Session.findOne({ code }) : null;
  if (!session) throw new AppError(404, 'Session not found');
  return session;
}

export async function findOwnedSession(rawCode: string, hostId: string) {
  const session = await findSession(rawCode);
  if (String(session.host) !== hostId) throw new AppError(403, 'This session belongs to another host');
  return session;
}

export async function findPoll(id: string) {
  assertId(id, 'Poll');
  const poll = await Poll.findById(id);
  const session = poll ? await Session.findById(poll.session) : null;
  if (!poll || !session) throw new AppError(404, 'Poll not found');
  return { poll, session };
}

export async function findOwnedPoll(id: string, hostId: string) {
  const found = await findPoll(id);
  if (String(found.session.host) !== hostId) throw new AppError(403, 'This session belongs to another host');
  return found;
}

export async function findQuestion(id: string) {
  assertId(id, 'Question');
  const question = await Question.findById(id);
  const session = question ? await Session.findById(question.session) : null;
  if (!question || !session) throw new AppError(404, 'Question not found');
  return { question, session };
}

export async function findOwnedQuestion(id: string, hostId: string) {
  const found = await findQuestion(id);
  if (String(found.session.host) !== hostId) throw new AppError(403, 'This session belongs to another host');
  return found;
}

/** A participant token is only valid for the session it was issued for. */
export function assertParticipantFor(session: { code: string }, auth: ParticipantAuth): void {
  if (auth.code !== session.code) throw new AppError(403, 'Your join token is for a different session');
}

export function assertLive(session: { status: string }): void {
  if (session.status !== 'live') throw new AppError(409, 'This session has ended');
}
