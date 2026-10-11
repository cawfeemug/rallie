import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type NewPoll } from '../api';
import { useAuth } from '../auth';
import { JoinQR } from '../components/JoinQR';
import { PollForm } from '../components/PollForm';
import { QuestionList } from '../components/QuestionList';
import { ResultBars } from '../components/ResultBars';
import type { PollWithResults } from '../types';
import { errMsg, isLocalOrigin, joinUrl, pluralize, setShareOrigin, shareOrigin } from '../util';
import { useLiveSession } from '../useLiveSession';

const STATUS_TAG = {
  draft: { className: 'tag tag-draft', label: 'Draft' },
  open: { className: 'tag tag-live', label: 'Voting open' },
  closed: { className: 'tag tag-closed', label: 'Closed' },
} as const;

interface PollCardProps {
  poll: PollWithResults;
  sessionLive: boolean;
  onStatus: (poll: PollWithResults, status: 'open' | 'closed') => void;
  onReset: (poll: PollWithResults) => void;
  onDelete: (poll: PollWithResults) => void;
}

function PollCard({ poll, sessionLive, onStatus, onReset, onDelete }: PollCardProps) {
  const tag = STATUS_TAG[poll.status];
  return (
    <li className={poll.status === 'open' ? 'poll poll-live' : 'poll'}>
      <div>
        <span className={tag.className}>{tag.label}</span>
        <h3>{poll.question}</h3>
        <p className="muted">
          {poll.type === 'multiple' ? 'Pick several' : 'Pick one'} · {pluralize(poll.results.totalVoters, 'voter')}
        </p>
      </div>

      <ResultBars poll={poll} results={poll.results} />

      <div className="poll-actions">
        {poll.status === 'open' ? (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => onStatus(poll, 'closed')}>
            Close voting
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={!sessionLive}
            onClick={() => onStatus(poll, 'open')}
          >
            {poll.status === 'draft' ? 'Start voting' : 'Reopen voting'}
          </button>
        )}
        {poll.results.totalVoters > 0 && (
          <button type="button" className="btn btn-sm" onClick={() => onReset(poll)}>
            Reset votes
          </button>
        )}
        <button type="button" className="btn btn-sm btn-quiet btn-danger" onClick={() => onDelete(poll)}>
          Delete
        </button>
      </div>
    </li>
  );
}

/** Join code, QR code and the address phones should open. */
function SharePanel({ code }: { code: string }) {
  const [origin, setOrigin] = useState(shareOrigin());
  const [draft, setDraft] = useState(origin);
  const [copied, setCopied] = useState(false);
  const url = joinUrl(code);
  const local = isLocalOrigin(origin);

  function saveOrigin() {
    const cleaned = draft.trim();
    if (cleaned && !/^https?:\/\//i.test(cleaned)) return;
    setShareOrigin(cleaned || null);
    setOrigin(shareOrigin());
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked on non-HTTPS pages. The link is visible and selectable anyway.
    }
  }

  return (
    <div className="stack" style={{ gap: '0.9rem' }}>
      <div className="share">
        <JoinQR code={code} size={132} />
        <div>
          <span className="label">Join code</span>
          <div className="share-code">{code}</div>
          <p className="share-url">{url}</p>
          <div className="row" style={{ marginTop: '0.6rem' }}>
            <button type="button" className="btn btn-sm" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <Link className="btn btn-sm" to={`/present/${code}`} target="_blank" rel="noreferrer">
              Open projector view
            </Link>
          </div>
        </div>
      </div>

      {local && (
        <div className="notice">
          <p>
            <strong>Phones cannot open “localhost”.</strong> Enter the address they should use, such as your computer's Wi-Fi
            IP (http://192.168.1.20:8080) or your public tunnel link. The QR code updates right away.
          </p>
        </div>
      )}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          saveOrigin();
        }}
      >
        <label className="sr-only" htmlFor="share-origin">
          Address phones should open
        </label>
        <input
          id="share-origin"
          className="input"
          style={{ maxWidth: '20rem' }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://rallie.example.com"
          inputMode="url"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button type="submit" className="btn btn-sm">
          Use this address
        </button>
      </form>
    </div>
  );
}

export default function HostSession() {
  const { code: rawCode = '' } = useParams();
  const code = rawCode.toUpperCase();
  const { token } = useAuth();
  const { state, dispatch, reload } = useLiveSession(code, token);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  if (state.status === 'loading') return <div className="page-loading">Loading session…</div>;

  if (state.status === 'notfound') {
    return (
      <main className="container">
        <p className="empty">{state.error ?? 'No session matches that code.'}</p>
        <Link className="btn btn-primary" to="/host">
          Back to your sessions
        </Link>
      </main>
    );
  }

  if (state.status === 'error' || !state.session) {
    return (
      <main className="container">
        <p className="notice notice-error" role="alert">
          {state.error ?? 'Could not load this session.'}
        </p>
        <p style={{ marginTop: '1rem' }}>
          <button type="button" className="btn btn-primary" onClick={() => void reload()}>
            Try again
          </button>
        </p>
      </main>
    );
  }

  if (!state.isHost || !token) {
    return (
      <main className="container">
        <p className="empty">This session belongs to a different host account, so you cannot manage it from here.</p>
        <Link className="btn btn-primary" to="/host">
          Back to your sessions
        </Link>
      </main>
    );
  }

  const { session } = state;
  const live = session.status === 'live';

  const createPoll = (body: NewPoll) =>
    act(async () => {
      const { poll } = await api.createPoll(token, code, body);
      dispatch({ type: 'poll', poll });
      setShowForm(false);
    });

  const setStatus = (poll: PollWithResults, status: 'open' | 'closed') =>
    act(async () => {
      const res = await api.setPollStatus(token, poll.id, status);
      dispatch({ type: 'poll', poll: res.poll });
      // Opening one poll closes the others on the server. Refresh so every card agrees.
      if (status === 'open') await reload();
    });

  const resetPoll = (poll: PollWithResults) => {
    if (!window.confirm('Clear every vote on this poll? This cannot be undone.')) return;
    void act(async () => {
      const { results } = await api.resetPoll(token, poll.id);
      dispatch({ type: 'poll-reset', results });
    });
  };

  const deletePoll = (poll: PollWithResults) => {
    if (!window.confirm(`Delete the poll "${poll.question}" and its votes?`)) return;
    void act(async () => {
      await api.deletePoll(token, poll.id);
      dispatch({ type: 'poll-deleted', id: poll.id });
    });
  };

  const toggleSession = () =>
    act(async () => {
      const next = live ? 'ended' : 'live';
      if (next === 'ended' && !window.confirm('End this session? Participants will no longer be able to vote or ask questions.')) return;
      const res = await api.updateSession(token, code, { status: next });
      dispatch({ type: 'session', patch: res.session });
    });

  return (
    <main className="container">
      <p className="muted" style={{ marginBottom: '0.75rem' }}>
        <Link to="/host">← Your sessions</Link>
      </p>

      <header className="session-head">
        <div>
          <h1>{session.title}</h1>
          <div className="session-meta">
            <span className={live ? 'tag tag-live' : 'tag'}>{live ? 'Live' : 'Ended'}</span>
            <span className={state.connected ? 'live' : 'live live-off'}>
              <span className="live-dot" aria-hidden="true" />
              {state.connected ? 'Connected' : 'Reconnecting…'}
            </span>
            <span className="muted">{pluralize(state.viewers, 'person', 'people')} here</span>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => void toggleSession()}>
            {live ? 'End session' : 'Reopen session'}
          </button>
        </div>
        <SharePanel code={code} />
      </header>

      {error && (
        <p className="notice notice-error" role="alert" style={{ marginBottom: '1.25rem' }}>
          {error}
        </p>
      )}

      <div className="workspace">
        <section aria-labelledby="polls-heading">
          <div className="section-head">
            <h2 id="polls-heading">Polls</h2>
            {!showForm && (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowForm(true)}>
                New poll
              </button>
            )}
          </div>

          {showForm && <PollForm onCreate={createPoll} onCancel={() => setShowForm(false)} />}

          {state.polls.length === 0 && !showForm ? (
            <p className="empty">
              No polls yet. Create one, then press Start voting and it appears on every phone and the projector.
            </p>
          ) : (
            <ul className="polls stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {state.polls.map((poll) => (
                <PollCard
                  key={poll.id}
                  poll={poll}
                  sessionLive={live}
                  onStatus={(p, s) => void setStatus(p, s)}
                  onReset={resetPoll}
                  onDelete={deletePoll}
                />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="questions-heading">
          <div className="section-head">
            <h2 id="questions-heading">Questions</h2>
            <span className="muted">{pluralize(state.questions.length, 'question')}</span>
          </div>
          <QuestionList
            questions={state.questions}
            mode="host"
            emptyText="Nothing asked yet. Questions from the audience appear here instantly."
            onAnswered={(id, answered) =>
              void act(async () => {
                const { question } = await api.setAnswered(token, id, answered);
                dispatch({ type: 'question', question });
              })
            }
            onDelete={(id) => {
              if (!window.confirm('Remove this question for everyone?')) return;
              void act(async () => {
                await api.deleteQuestion(token, id);
                dispatch({ type: 'question-deleted', id });
              });
            }}
          />
        </section>
      </div>
    </main>
  );
}
