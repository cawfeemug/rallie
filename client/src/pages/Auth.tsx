import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { errMsg } from '../util';

type Mode = 'login' | 'register';

export default function Auth() {
  const { user, login, register } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const from = (location.state as { from?: string } | null)?.from ?? '/host';

  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    api
      .health()
      .then((h) => setDemo(h.demo))
      .catch(() => setDemo(false));
  }, []);

  // Arriving from the "demo host account" link signs in straight away.
  useEffect(() => {
    if (params.get('demo') === '1') void run(() => login('demo@rallie.dev', 'demo1234'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(() => (mode === 'login' ? login(email, password) : register(name, email, password)));
  }

  if (user) return <Navigate to={from} replace />;

  return (
    <main className="container container-narrow">
      <h1 className="page-title">{mode === 'login' ? 'Sign in to host' : 'Create a host account'}</h1>

      <form className="stack" onSubmit={submit}>
        {mode === 'register' && (
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? 8 : undefined}
            required
          />
          {mode === 'register' && <span className="hint">At least 8 characters.</span>}
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
          >
            {mode === 'login' ? 'Create an account' : 'I already have an account'}
          </button>
        </div>
      </form>

      {demo && (
        <div className="notice" style={{ marginTop: '2rem' }}>
          <p>
            <strong>Just looking around?</strong> Use the demo host, which already has polls, votes and questions.
          </p>
          <p style={{ marginTop: '0.75rem' }}>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void run(() => login('demo@rallie.dev', 'demo1234'))}>
              Sign in as demo host
            </button>
          </p>
        </div>
      )}
    </main>
  );
}
