import type { IPollOption, PollStatus, PollType } from './models';

// Structural types so both hydrated documents and lean() results can be passed in.
type PollLike = {
  _id: unknown;
  question: string;
  type: PollType;
  options: ReadonlyArray<IPollOption>;
  status: PollStatus;
  createdAt?: Date;
};

type QuestionLike = {
  _id: unknown;
  text: string;
  authorName: string;
  upvotes: number;
  answered: boolean;
  createdAt?: Date;
};

type SessionLike = {
  _id: unknown;
  code: string;
  title: string;
  status: 'live' | 'ended';
  createdAt?: Date;
};

type UserLike = { _id: unknown; name: string; email: string };

const iso = (d?: Date) => (d ? d.toISOString() : new Date(0).toISOString());

export function pollDto(p: PollLike) {
  return {
    id: String(p._id),
    question: p.question,
    type: p.type,
    options: p.options.map((o) => ({ id: o.id, text: o.text })),
    status: p.status,
    createdAt: iso(p.createdAt),
  };
}

/** Never includes author ids or the upvoter list. */
export function questionDto(q: QuestionLike) {
  return {
    id: String(q._id),
    text: q.text,
    authorName: q.authorName,
    upvotes: q.upvotes,
    answered: q.answered,
    createdAt: iso(q.createdAt),
  };
}

export function sessionDto(s: SessionLike) {
  return { id: String(s._id), code: s.code, title: s.title, status: s.status, createdAt: iso(s.createdAt) };
}

export function userDto(u: UserLike) {
  return { id: String(u._id), name: u.name, email: u.email };
}
