export type PollStatus = 'draft' | 'open' | 'closed';
export type PollType = 'single' | 'multiple';
export type SessionStatus = 'live' | 'ended';

export interface PollOption {
  id: string;
  text: string;
}

export interface PollResults {
  pollId: string;
  /** People who voted (not the number of ticks, which differs for multiple choice). */
  totalVoters: number;
  /** option id -> votes */
  counts: Record<string, number>;
}

export interface Poll {
  id: string;
  question: string;
  type: PollType;
  options: PollOption[];
  status: PollStatus;
  createdAt: string;
}

export interface PollWithResults extends Poll {
  results: PollResults;
}

export interface Question {
  id: string;
  text: string;
  authorName: string;
  upvotes: number;
  answered: boolean;
  createdAt: string;
  /** Whether the current participant has upvoted it. Always false for hosts and viewers. */
  upvoted: boolean;
}

/** What the server broadcasts: the same as Question without the per-viewer flag. */
export type QuestionEvent = Omit<Question, 'upvoted'>;

export interface SessionInfo {
  code: string;
  title: string;
  status: SessionStatus;
}

export interface SessionSummary extends SessionInfo {
  id: string;
  createdAt: string;
  pollCount: number;
  questionCount: number;
}

export interface SessionSnapshot {
  session: SessionInfo;
  isHost: boolean;
  polls: PollWithResults[];
  questions: Question[];
  /** pollId -> option ids the current participant picked */
  myVotes: Record<string, string[]>;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Health {
  ok: boolean;
  db: boolean;
  demo: boolean;
}
