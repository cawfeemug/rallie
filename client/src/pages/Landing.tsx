import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { JoinQR } from '../components/JoinQR';
import { ResultBars } from '../components/ResultBars';
import { pickActivePoll, pluralize } from '../util';
import { useLiveSession } from '../useLiveSession';

const DEMO_CODE = 'DEMO42';

/**
 * Live view of the seeded demo session. Anyone who scans the QR code and votes
 * sees these bars move, which is the quickest way to show the product working.
 */
function LiveDemo() {
  const { state } = useLiveSession(DEMO_CODE, null);
  const poll = pickActivePoll(state.polls);
  if (state.status !== 'ready' || !poll) return null;

  return (
    <aside className="live-demo" aria-label="Live demo session">
      <div className="stack" style={{ gap: '0.6rem' }}>
        <span className={state.connected ? 'live' : 'live live-off'}>
          <span className="live-dot" aria-hidden="true" />
          {state.connected ? 'Live now' : 'Reconnecting'}
        </span>
        <h2>{poll.question}</h2>
      </div>
      <ResultBars poll={poll} results={poll.results} />
      <div className="live-demo-foot">
        <JoinQR code={DEMO_CODE} size={96} />
        <p>
          {pluralize(poll.results.totalVoters, 'vote')} so far. Scan to join the demo session from your phone and add yours.
        </p>
      </div>
    </aside>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    api
      .health()
      .then((h) => setDemo(h.demo))
      .catch(() => setDemo(false));
  }, []);

  function join(e: FormEvent) {
    e.preventDefault();
    if (code.length === 6) navigate(`/s/${code}`);
  }

  return (
    <main className="container">
      <section className="hero">
        <div>
          <h1>Ask the room. Watch the answers arrive.</h1>
          <p className="hero-lead">
            Run live polls and audience Q&amp;A from a single link. People join from their phones with a code, with no app
            and no account, and the results move as votes come in.
          </p>

          <form className="join-form" onSubmit={join}>
            <label className="label" htmlFor="join-code">
              Have a join code?
            </label>
            <div className="join-row">
              <input
                id="join-code"
                className="input code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="ABC123"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={6}
              />
              <button type="submit" className="btn btn-primary" disabled={code.length !== 6}>
                Join
              </button>
            </div>
          </form>

          <p className="hero-sub">
            Running the session? <Link to="/host">Host a session</Link>
            {demo && (
              <>
                {' '}
                or <Link to="/auth?demo=1">sign in with the demo host account</Link>
              </>
            )}
            .
          </p>
        </div>

        {demo && <LiveDemo />}
      </section>

      <section className="facts" aria-label="What Rallie does">
        <div>
          <h3>Polls that update live</h3>
          <p>Single or multiple choice. One poll is open at a time, and every phone and the projector see each vote land.</p>
        </div>
        <div>
          <h3>Questions from the audience</h3>
          <p>Anyone can ask. Upvotes push the best questions to the top, and the host marks them answered as they go.</p>
        </div>
        <div>
          <h3>Runs on your own machine</h3>
          <p>One command starts the app, the API and the database. Put it online with a tunnel when you need a public link.</p>
        </div>
      </section>

      <p className="stack-note">Built with React, TypeScript, Node, Socket.IO, MongoDB and Docker.</p>
    </main>
  );
}
