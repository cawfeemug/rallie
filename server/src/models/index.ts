import { Poll } from './Poll';
import { Question } from './Question';
import { Session } from './Session';
import { User } from './User';
import { Vote } from './Vote';

export { Poll, Question, Session, User, Vote };
export type { IPoll, IPollOption, PollStatus, PollType } from './Poll';
export type { IQuestion } from './Question';
export type { ISession, SessionStatus } from './Session';
export type { IUser } from './User';
export type { IVote } from './Vote';

/** Waits until every collection and its indexes (including the unique ones) exist. */
export async function initModels(): Promise<void> {
  await Promise.all([User.init(), Session.init(), Poll.init(), Vote.init(), Question.init()]);
}
