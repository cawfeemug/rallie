import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import type { SessionSummary } from '../types';
import { errMsg, formatDate, pluralize } from '../util';

export default function Dashboard() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setSessions((await api.listSessions(token)).sessions);
    } catch (err) {
      setError(errMsg(err));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!token || title.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const { session } = await api.createSession(token, title.trim());
      navigate(`/host/${session.code}`);
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  async function remove(session: SessionSummary) {
    if (!token) return;
    if (!window.confirm(`Delete "${session.title}" and all of its polls, votes and questions? This cannot be undone.`)) return;
    try {
      await api.deleteSession(token, session.code);
      await load();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  return (
    <main className="container">
      <h1 className="page-title">Your sessions</h1>

      <form className="create-row" onSubmit={create}>
        <div className="field">
          <label className="sr-only" htmlFor="session-title">
            Session title
          </label>
          <input
            id="session-title"
            className="input"
            placeholder="Name your session, e.g. Friday team meeting"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || title.trim().length < 3}>
          {busy ? 'Creating…' : 'Create session'}
        </button>
      </form>

      {error && (
        <p className="error" role="alert" style={{ marginBottom: '1rem' }}>
          {error}
        </p>
      )}

      {sessions === null ? (
        <p className="muted">Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <p className="empty">No sessions yet. Name one above and you will get a join code and QR code to share.</p>
      ) : (
        <ul className="list">
          {sessions.map((s) => (
            <li className="list-item" key={s.id}>
              <div>
                <h2>
                  <Link to={`/host/${s.code}`}>{s.title}</Link>
                  <span className={s.status === 'live' ? 'tag tag-live' : 'tag'} style={{ marginLeft: '0.6rem' }}>
                    {s.status === 'live' ? 'Live' : 'Ended'}
                  </span>
                </h2>
                <p className="muted">
                  <span className="code-chip">{s.code}</span>
                  {'  '}
                  {pluralize(s.pollCount, 'poll')}, {pluralize(s.questionCount, 'question')}, created {formatDate(s.createdAt)}
                </p>
              </div>
              <div className="row">
                <Link className="btn btn-sm btn-primary" to={`/host/${s.code}`}>
                  Open
                </Link>
                <button type="button" className="btn btn-sm btn-quiet btn-danger" onClick={() => void remove(s)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
