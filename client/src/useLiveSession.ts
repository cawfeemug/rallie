import { useCallback, useEffect, useReducer, useRef, type Dispatch } from 'react';
import { io } from 'socket.io-client';
import { api, ApiError } from './api';
import type {
  Poll,
  PollResults,
  PollWithResults,
  Question,
  QuestionEvent,
  SessionInfo,
  SessionSnapshot,
} from './types';
import { emptyResults, errMsg } from './util';

export interface LiveState {
  status: 'loading' | 'ready' | 'notfound' | 'error';
  error: string | null;
  session: SessionInfo | null;
  isHost: boolean;
  polls: PollWithResults[];
  questions: Question[];
  myVotes: Record<string, string[]>;
  viewers: number;
  connected: boolean;
}

export type LiveAction =
  | { type: 'snapshot'; snapshot: SessionSnapshot }
  | { type: 'failed'; status: 'notfound' | 'error'; error: string }
  | { type: 'poll'; poll: Poll }
  | { type: 'poll-deleted'; id: string }
  | { type: 'results'; results: PollResults }
  | { type: 'poll-reset'; results: PollResults }
  | { type: 'question'; question: QuestionEvent }
  | { type: 'question-deleted'; id: string }
  | { type: 'session'; patch: Partial<SessionInfo> }
  | { type: 'session-deleted' }
  | { type: 'presence'; viewers: number }
  | { type: 'connected'; connected: boolean }
  | { type: 'voted'; pollId: string; choices: string[]; results: PollResults }
  | { type: 'upvoted'; question: Question };

const initialState: LiveState = {
  status: 'loading',
  error: null,
  session: null,
  isHost: false,
  polls: [],
  questions: [],
  myVotes: {},
  viewers: 0,
  connected: false,
};

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

function reducer(state: LiveState, action: LiveAction): LiveState {
  switch (action.type) {
    case 'snapshot':
      return {
        ...state,
        status: 'ready',
        error: null,
        session: action.snapshot.session,
        isHost: action.snapshot.isHost,
        polls: action.snapshot.polls,
        questions: action.snapshot.questions,
        myVotes: action.snapshot.myVotes,
      };

    case 'failed':
      // A failed background refresh must not blank a screen that is already showing data.
      if (action.status === 'error' && state.status === 'ready') return state;
      return { ...state, status: action.status, error: action.error };

    case 'poll': {
      const exists = state.polls.some((p) => p.id === action.poll.id);
      const polls = exists
        ? state.polls.map((p) => (p.id === action.poll.id ? { ...action.poll, results: p.results } : p))
        : [...state.polls, { ...action.poll, results: emptyResults(action.poll) }];
      return { ...state, polls };
    }

    case 'poll-deleted':
      return {
        ...state,
        polls: state.polls.filter((p) => p.id !== action.id),
        myVotes: withoutKey(state.myVotes, action.id),
      };

    case 'results':
      return {
        ...state,
        polls: state.polls.map((p) => (p.id === action.results.pollId ? { ...p, results: action.results } : p)),
      };

    case 'poll-reset':
      return {
        ...state,
        polls: state.polls.map((p) => (p.id === action.results.pollId ? { ...p, results: action.results } : p)),
        myVotes: withoutKey(state.myVotes, action.results.pollId),
      };

    case 'question': {
      const existing = state.questions.find((q) => q.id === action.question.id);
      const questions = existing
        ? state.questions.map((q) => (q.id === action.question.id ? { ...q, ...action.question } : q))
        : [...state.questions, { ...action.question, upvoted: false }];
      return { ...state, questions };
    }

    case 'question-deleted':
      return { ...state, questions: state.questions.filter((q) => q.id !== action.id) };

    case 'session':
      return state.session ? { ...state, session: { ...state.session, ...action.patch } } : state;

    case 'session-deleted':
      return { ...state, status: 'notfound', error: 'This session was deleted by the host.' };

    case 'presence':
      return { ...state, viewers: action.viewers };

    case 'connected':
      return { ...state, connected: action.connected };

    case 'voted':
      return {
        ...state,
        myVotes: { ...state.myVotes, [action.pollId]: action.choices },
        polls: state.polls.map((p) => (p.id === action.pollId ? { ...p, results: action.results } : p)),
      };

    case 'upvoted': {
      const exists = state.questions.some((q) => q.id === action.question.id);
      return {
        ...state,
        questions: exists
          ? state.questions.map((q) => (q.id === action.question.id ? action.question : q))
          : [...state.questions, action.question],
      };
    }

    default:
      return state;
  }
}

/**
 * Loads a session snapshot over HTTP, then keeps it fresh from Socket.IO events.
 * Used by the host dashboard, the projector view and the participant phone view.
 *
 * Snapshot-then-patch: the REST snapshot is the source of truth. Socket events only patch it,
 * and after a reconnect the snapshot is fetched again so a flaky connection can never leave
 * the screen permanently out of date.
 */
export function useLiveSession(code: string, token: string | null) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const reload = useCallback(async () => {
    try {
      dispatch({ type: 'snapshot', snapshot: await api.getSession(code, tokenRef.current) });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        dispatch({ type: 'failed', status: 'notfound', error: 'No session matches that code.' });
      } else {
        dispatch({ type: 'failed', status: 'error', error: errMsg(err) });
      }
    }
  }, [code]);

  useEffect(() => {
    let firstConnect = true;
    void reload();

    const socket = io();
    socket.on('connect', () => {
      dispatch({ type: 'connected', connected: true });
      socket.emit('session:join', { code, token: tokenRef.current });
      if (!firstConnect) void reload(); // catch up on anything missed while offline
      firstConnect = false;
    });
    socket.on('disconnect', () => dispatch({ type: 'connected', connected: false }));
    socket.on('presence', (p: { viewers: number }) => dispatch({ type: 'presence', viewers: p.viewers }));

    socket.on('poll:created', (poll: Poll) => dispatch({ type: 'poll', poll }));
    socket.on('poll:updated', (poll: Poll) => dispatch({ type: 'poll', poll }));
    socket.on('poll:deleted', (p: { id: string }) => dispatch({ type: 'poll-deleted', id: p.id }));
    socket.on('poll:results', (results: PollResults) => dispatch({ type: 'results', results }));
    socket.on('poll:reset', (results: PollResults) => dispatch({ type: 'poll-reset', results }));

    socket.on('question:created', (question: QuestionEvent) => dispatch({ type: 'question', question }));
    socket.on('question:updated', (question: QuestionEvent) => dispatch({ type: 'question', question }));
    socket.on('question:deleted', (q: { id: string }) => dispatch({ type: 'question-deleted', id: q.id }));

    socket.on('session:updated', (patch: Partial<SessionInfo>) => dispatch({ type: 'session', patch }));
    socket.on('session:deleted', () => dispatch({ type: 'session-deleted' }));

    return () => {
      socket.disconnect();
    };
  }, [code, reload]);

  return { state, dispatch: dispatch as Dispatch<LiveAction>, reload };
}
