import type { Poll, PollResults, PollWithResults, Question } from './types';

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong. Please try again.';
}

export function emptyResults(poll: Pick<Poll, 'id' | 'options'>): PollResults {
  return {
    pollId: poll.id,
    totalVoters: 0,
    counts: Object.fromEntries(poll.options.map((o) => [o.id, 0])),
  };
}

// ---- localStorage helpers (storage can throw in private mode, so never let it break the UI) ----
export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export const readParticipantToken = (code: string) => storageGet(`rallie.p.${code}`);
export const saveParticipantToken = (code: string, token: string | null) => storageSet(`rallie.p.${code}`, token);

// ---- join links ----
const ORIGIN_KEY = 'rallie.origin';

/** The address phones should open. Defaults to the current page; hosts can override it (LAN IP, tunnel URL). */
export function shareOrigin(): string {
  return (storageGet(ORIGIN_KEY) || window.location.origin).replace(/\/+$/, '');
}

export function setShareOrigin(value: string | null): void {
  storageSet(ORIGIN_KEY, value ? value.trim().replace(/\/+$/, '') : null);
}

export const joinUrl = (code: string) => `${shareOrigin()}/s/${code}`;

export const isLocalOrigin = (origin: string = shareOrigin()) =>
  /^https?:\/\/(localhost|127\.|\[::1\]|0\.0\.0\.0)/i.test(origin);

// ---- display helpers ----
export function sortQuestions(questions: Question[]): Question[] {
  return [...questions].sort(
    (a, b) => Number(a.answered) - Number(b.answered) || b.upvotes - a.upvotes || a.createdAt.localeCompare(b.createdAt),
  );
}

/** The poll the projector should show: the open one, otherwise the most recently closed one. */
export function pickActivePoll(polls: PollWithResults[]): PollWithResults | null {
  const open = polls.find((p) => p.status === 'open');
  if (open) return open;
  const closed = polls.filter((p) => p.status === 'closed');
  return closed.length > 0 ? closed[closed.length - 1] : null;
}

export const pluralize = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
