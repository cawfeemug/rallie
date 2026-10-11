import type { Poll, PollResults } from '../types';

interface Props {
  poll: Pick<Poll, 'options'>;
  results: PollResults;
  /** Option ids the current participant picked, marked with a tag. */
  mine?: string[];
  /** Projector sizing. */
  large?: boolean;
}

/**
 * Horizontal result bars. Width is each option's share of voters, so on a multiple choice
 * poll the bars can add up to more than 100%. The leading option is highlighted in amber.
 * Width changes are animated with a CSS transition, which is what makes live votes visible.
 */
export function ResultBars({ poll, results, mine = [], large = false }: Props) {
  const total = results.totalVoters;
  const top = Math.max(0, ...poll.options.map((o) => results.counts[o.id] ?? 0));

  return (
    <ul className={large ? 'bars bars-large' : 'bars'}>
      {poll.options.map((option) => {
        const count = results.counts[option.id] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const leading = count > 0 && count === top;
        return (
          <li key={option.id} className={leading ? 'bar bar-lead' : 'bar'}>
            <div className="bar-row">
              <span className="bar-label">
                {option.text}
                {mine.includes(option.id) && <span className="tag">Your vote</span>}
              </span>
              <span className="bar-value">
                <strong>{pct}%</strong>
                <span className="bar-count">{count}</span>
              </span>
            </div>
            <div
              className="bar-track"
              role="progressbar"
              aria-label={option.text}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <div className="bar-fill" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
