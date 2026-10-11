import type {
  Health,
  PollResults,
  PollType,
  PollWithResults,
  Question,
  SessionInfo,
  SessionSnapshot,
  SessionStatus,
  SessionSummary,
  User,
} from './types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Opts = { body?: unknown; token?: string | null };

async function request<T>(method: string, path: string, { body, token }: Opts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data && typeof data.error === 'string' ? data.error : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export interface NewPoll {
  question: string;
  type: PollType;
  options: string[];
}

export const api = {
  health: () => request<Health>('GET', '/health'),

  // --- host accounts ---
  register: (body: { name: string; email: string; password: string }) =>
    request<{ token: string; user: User }>('POST', '/auth/register', { body }),
  login: (body: { email: string; password: string }) =>
    request<{ token: string; user: User }>('POST', '/auth/login', { body }),
  me: (token: string) => request<{ user: User }>('GET', '/auth/me', { token }),

  // --- sessions ---
  listSessions: (token: string) => request<{ sessions: SessionSummary[] }>('GET', '/sessions', { token }),
  createSession: (token: string, title: string) =>
    request<{ session: SessionInfo & { id: string } }>('POST', '/sessions', { token, body: { title } }),
  updateSession: (token: string, code: string, body: { title?: string; status?: SessionStatus }) =>
    request<{ session: SessionInfo }>('PATCH', `/sessions/${code}`, { token, body }),
  deleteSession: (token: string, code: string) => request<void>('DELETE', `/sessions/${code}`, { token }),
  getSession: (code: string, token?: string | null) =>
    request<SessionSnapshot>('GET', `/sessions/${code}`, { token }),

  // --- participants ---
  join: (code: string) =>
    request<{ token: string; voterId: string; session: SessionInfo }>('POST', `/sessions/${code}/join`),

  // --- polls ---
  createPoll: (token: string, code: string, body: NewPoll) =>
    request<{ poll: PollWithResults }>('POST', `/sessions/${code}/polls`, { token, body }),
  setPollStatus: (token: string, id: string, status: 'open' | 'closed') =>
    request<{ poll: PollWithResults }>('PATCH', `/polls/${id}`, { token, body: { status } }),
  resetPoll: (token: string, id: string) =>
    request<{ results: PollResults }>('POST', `/polls/${id}/reset`, { token }),
  deletePoll: (token: string, id: string) => request<void>('DELETE', `/polls/${id}`, { token }),
  vote: (token: string, id: string, choices: string[]) =>
    request<{ choices: string[]; results: PollResults }>('POST', `/polls/${id}/vote`, { token, body: { choices } }),

  // --- questions ---
  askQuestion: (token: string, code: string, text: string, name?: string) =>
    request<{ question: Question }>('POST', `/sessions/${code}/questions`, { token, body: { text, name } }),
  upvote: (token: string, id: string) =>
    request<{ question: Question; upvoted: boolean }>('POST', `/questions/${id}/upvote`, { token }),
  setAnswered: (token: string, id: string, answered: boolean) =>
    request<{ question: Question }>('PATCH', `/questions/${id}`, { token, body: { answered } }),
  deleteQuestion: (token: string, id: string) => request<void>('DELETE', `/questions/${id}`, { token }),
};
