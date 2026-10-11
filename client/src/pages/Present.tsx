import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { JoinQR } from '../components/JoinQR';
import { QuestionList } from '../components/QuestionList';
import { ResultBars } from '../components/ResultBars';
import { ThemeToggle } from '../components/ThemeToggle';
import { joinUrl, pickActivePoll, pluralize } from '../util';
import { useLiveSession } from '../useLiveSession';

type View = 'poll' | 'questions';

/** Big-screen view for a projector. Public by code, read only, and updates as votes arrive. */
export default function Present() {
  const { code: rawCode = '' } = useParams();
  const code = rawCode.toUpperCase();
  const { state } = useLiveSession(code, null);
  const [view, setView] = useState<View>('poll');
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === 'q' || e.key === 'Q') setView((v) => (v === 'poll' ? 'questions' : 'poll'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  if (state.status === 'loading') return <div className="page-loading">Loading…</div>;

  if (state.status !== 'ready' || !state.session) {
    return (
      <main className="container container-narrow">
        <h1 className="page-title">{state.status === 'notfound' ? 'Session not found' : 'Cannot load this session'}</h1>
        <p className="muted">{state.error}</p>
        <p style={{ marginTop: '1rem' }}>
          <Link className="btn btn-primary" to="/">
            Back to Rallie
          </Link>
        </p>
      </main>
    );
  }

  const poll = pickActivePoll(state.polls);
  const open = poll?.status === 'open';
  const url = joinUrl(code);
  const shortUrl = url.replace(/^https?:\/\//, '');

  return (
    <div className="present">
      <main className="present-main">
        <div className="stack" style={{ gap: '0.6rem' }}>
          <span className={state.connected ? 'live' : 'live live-off'}>
            <span className="live-dot" aria-hidden="true" />
            {state.connected ? state.session.title : 'Reconnecting…'}
          </span>
        </div>

        {state.session.status === 'ended' ? (
          <p className="present-waiting">This session has ended. Thanks for taking part.</p>
        ) : view === 'questions' ? (
          <>
            <h1 className="present-question">Questions from the room</h1>
            <QuestionList
              questions={state.questions}
              mode="view"
              large
              limit={6}
              emptyText="No questions yet. Scan the code to ask the first one."
            />
          </>
        ) : poll ? (
          <>
            <h1 className="present-question">{poll.question}</h1>
            <ResultBars poll={poll} results={poll.results} large />
            <p className="present-foot">
              <span>{pluralize(poll.results.totalVoters, 'vote')}</span>
              <span>{open ? 'Voting is open' : 'Voting is closed'}</span>
            </p>
          </>
        ) : (
          <p className="present-waiting">Waiting for the first poll. Scan the code to join.</p>
        )}
      </main>

      <aside className="present-side" aria-label="How to join">
        <JoinQR code={code} size={220} />
        <div className="present-join">
          <span className="label">Join at</span>
          <span className="present-url">{shortUrl}</span>
          <span className="label" style={{ marginTop: '0.75rem' }}>
            Code
          </span>
          <span className="present-code">{code}</span>
        </div>
        <p className="muted">{pluralize(state.viewers, 'person', 'people')} here</p>
      </aside>

      <div className="present-controls">
        <button type="button" className="btn btn-sm" onClick={() => setView(view === 'poll' ? 'questions' : 'poll')}>
          {view === 'poll' ? 'Show questions' : 'Show poll'} (Q)
        </button>
        <button type="button" className="btn btn-sm" onClick={toggleFullscreen}>
          {fullscreen ? 'Exit full screen' : 'Full screen'}
        </button>
        <ThemeToggle />
      </div>
    </div>
  );
}
