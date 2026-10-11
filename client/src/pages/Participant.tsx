import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { RallieMark } from '../components/Layout';
import { QuestionList } from '../components/QuestionList';
import { ResultBars } from '../components/ResultBars';
import { ThemeToggle } from '../components/ThemeToggle';
import type { PollWithResults } from '../types';
import { errMsg, readParticipantToken, saveParticipantToken } from '../util';
import { useLiveSession } from '../useLiveSession';

const MAX_QUESTION_LENGTH = 280;

/** One open poll: pick an option (or several) and submit. Votes are final once cast. */
function VoteForm({
  poll,
  disabled,
  onSubmit,
}: {
  poll: PollWithResults;
  disabled: boolean;
  onSubmit: (choices: string[]) => Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const multiple = poll.type === 'multiple';

  function toggle(id: string) {
    setPicked((prev) => (multiple ? (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]) : [id]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (picked.length === 0 || busy) return;
    setBusy(true);
    try {
      await onSubmit(picked);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <h2 className="vote-question">{poll.question}</h2>
      <fieldset className="choices" disabled={disabled || busy}>
        <legend className="sr-only">{multiple ? 'Choose one or more options' : 'Choose one option'}</legend>
        {poll.options.map((option) => (
          <label className="choice" key={option.id}>
            <input
              type={multiple ? 'checkbox' : 'radio'}
              name={`poll-${poll.id}`}
              checked={picked.includes(option.id)}
              onChange={() => toggle(option.id)}
            />
            {option.text}
          </label>
        ))}
      </fieldset>
      {multiple && <p className="hint">You can pick more than one.</p>}
      <button type="submit" className="btn btn-primary" disabled={disabled || busy || picked.length === 0}>
        {busy ? 'Sending…' : 'Submit vote'}
      </button>
    </form>
  );
}

function AskForm({ disabled, onAsk }: { disabled: boolean; onAsk: (text: string, name: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (text.trim().length < 3 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAsk(text.trim(), name.trim());
      setText('');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="ask-text">Ask a question</label>
        <textarea
          id="ask-text"
          className="textarea"
          rows={3}
          maxLength={MAX_QUESTION_LENGTH}
          value={text}
          disabled={disabled}
          placeholder="What would you like to know?"
          onChange={(e) => setText(e.target.value)}
        />
        <span className="hint counter">
          {text.length}/{MAX_QUESTION_LENGTH}
        </span>
      </div>
      <div className="field">
        <label htmlFor="ask-name">Your name (optional)</label>
        <input
          id="ask-name"
          className="input"
          value={name}
          maxLength={40}
          disabled={disabled}
          placeholder="Anonymous"
          autoComplete="nickname"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={disabled || busy || text.trim().length < 3}>
        {busy ? 'Sending…' : 'Send question'}
      </button>
    </form>
  );
}

function PhoneSession({ code, token, onAuthLost }: { code: string; token: string; onAuthLost: () => void }) {
  const { state, dispatch, reload } = useLiveSession(code, token);
  const [error, setError] = useState<string | null>(null);

  // A rejected token means it expired. Get a fresh one rather than leaving the person stuck.
  const handle = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onAuthLost();
        return;
      }
      setError(errMsg(err));
    },
    [onAuthLost],
  );

  if (state.status === 'loading') return <div className="page-loading">Joining…</div>;

  if (state.status !== 'ready' || !state.session) {
    return (
      <main className="phone">
        <h1 className="phone-title">{state.status === 'notfound' ? 'Session not found' : 'Cannot reach the session'}</h1>
        <p className="muted">{state.error}</p>
        <div className="row">
          {state.status === 'error' && (
            <button type="button" className="btn btn-primary" onClick={() => void reload()}>
              Try again
            </button>
          )}
          <Link className="btn" to="/">
            Enter a different code
          </Link>
        </div>
      </main>
    );
  }

  const { session } = state;
  const live = session.status === 'live';
  const openPoll = state.polls.find((p) => p.status === 'open') ?? null;
  const closedPolls = state.polls.filter((p) => p.status === 'closed' && p.id !== openPoll?.id).reverse();
  const myChoices = openPoll ? state.myVotes[openPoll.id] : undefined;

  async function vote(poll: PollWithResults, choices: string[]) {
    setError(null);
    try {
      const res = await api.vote(token, poll.id, choices);
      dispatch({ type: 'voted', pollId: poll.id, choices: res.choices, results: res.results });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Already voted from another tab, or the poll just closed. Sync with the server.
        setError(err.message);
        await reload();
        return;
      }
      handle(err);
    }
  }

  async function ask(text: string, name: string) {
    try {
      const { question } = await api.askQuestion(token, code, text, name || undefined);
      dispatch({ type: 'upvoted', question });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthLost();
        return;
      }
      throw err;
    }
  }

  async function upvote(id: string) {
    setError(null);
    try {
      const { question } = await api.upvote(token, id);
      dispatch({ type: 'upvoted', question });
    } catch (err) {
      handle(err);
    }
  }

  return (
    <main className="phone">
      <header className="phone-head">
        <div className="stack" style={{ gap: '0.35rem' }}>
          <span className={state.connected ? 'live' : 'live live-off'}>
            <span className="live-dot" aria-hidden="true" />
            {state.connected ? 'Connected' : 'Reconnecting…'}
          </span>
          <h1 className="phone-title">{session.title}</h1>
        </div>
        <div className="row">
          <RallieMark />
          <ThemeToggle />
        </div>
      </header>

      {!live && (
        <p className="notice">This session has ended. You can still see the results, but voting and questions are closed.</p>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      <section className="phone-section" aria-label="Poll">
        {openPoll && live ? (
          myChoices ? (
            <div className="stack">
              <h2 className="vote-question">{openPoll.question}</h2>
              <p className="thanks">Thanks, your vote is in.</p>
              <ResultBars poll={openPoll} results={openPoll.results} mine={myChoices} />
            </div>
          ) : (
            <VoteForm key={openPoll.id} poll={openPoll} disabled={!live} onSubmit={(choices) => vote(openPoll, choices)} />
          )
        ) : (
          live && (
            <div className="waiting">
              <h2>Waiting for the next poll</h2>
              <p className="muted">It will appear here the moment the host starts it. You do not need to refresh.</p>
            </div>
          )
        )}

        {closedPolls.length > 0 && (
          <details className="earlier" open={!live || !openPoll}>
            <summary>Earlier polls ({closedPolls.length})</summary>
            {closedPolls.map((poll) => (
              <div className="poll" key={poll.id}>
                <h3>{poll.question}</h3>
                <ResultBars poll={poll} results={poll.results} mine={state.myVotes[poll.id] ?? []} />
              </div>
            ))}
          </details>
        )}
      </section>

      <section className="phone-section" aria-label="Questions">
        <h2>Questions</h2>
        <AskForm disabled={!live} onAsk={ask} />
        <QuestionList
          questions={state.questions}
          mode="participant"
          disabled={!live}
          emptyText="No questions yet. Be the first to ask."
          onUpvote={(id) => void upvote(id)}
        />
      </section>
    </main>
  );
}

function Gate({ code }: { code: string }) {
  const [token, setToken] = useState<string | null>(() => readParticipantToken(code));
  const [joinError, setJoinError] = useState<{ notFound: boolean; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const validCode = /^[A-Z0-9]{6}$/.test(code);

  // No saved token: join to get one. It is stored per session code so a refresh keeps the same voter identity.
  useEffect(() => {
    if (token || !validCode) return;
    let cancelled = false;
    api
      .join(code)
      .then((res) => {
        if (cancelled) return;
        saveParticipantToken(code, res.token);
        setJoinError(null);
        setToken(res.token);
      })
      .catch((err) => {
        if (cancelled) return;
        setJoinError({ notFound: err instanceof ApiError && err.status === 404, message: errMsg(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [code, token, validCode, attempt]);

  const authLost = useCallback(() => {
    saveParticipantToken(code, null);
    setToken(null);
  }, [code]);

  if (!validCode || joinError) {
    const notFound = !validCode || joinError?.notFound;
    return (
      <main className="phone">
        <h1 className="phone-title">{notFound ? 'No session matches that code' : 'Could not join'}</h1>
        <p className="muted">
          {notFound ? 'Check the six characters on the screen and try again.' : joinError?.message}
        </p>
        <div className="row">
          {!notFound && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setJoinError(null);
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </button>
          )}
          <Link className="btn" to="/">
            Enter a different code
          </Link>
        </div>
      </main>
    );
  }

  if (!token) return <div className="page-loading">Joining…</div>;
  // Keyed by token so a refreshed token starts a clean live connection.
  return <PhoneSession key={token} code={code} token={token} onAuthLost={authLost} />;
}

export default function Participant() {
  const { code = '' } = useParams();
  const normalized = code.toUpperCase();
  return <Gate key={normalized} code={normalized} />;
}
