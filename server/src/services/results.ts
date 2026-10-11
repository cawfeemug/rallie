import type { Types } from 'mongoose';
import { Vote } from '../models';

export interface PollResults {
  pollId: string;
  /** Number of people who voted (not the number of ticks, which differs for multiple choice). */
  totalVoters: number;
  /** option id -> number of votes */
  counts: Record<string, number>;
}

type PollRef = { _id: Types.ObjectId; options: ReadonlyArray<{ id: string }> };

export function emptyResults(poll: PollRef): PollResults {
  return {
    pollId: String(poll._id),
    totalVoters: 0,
    counts: Object.fromEntries(poll.options.map((o) => [o.id, 0])),
  };
}

/**
 * Tallies several polls with ONE aggregation round trip.
 *
 *   $match   -> only votes for the requested polls (uses the {poll, voterId} index)
 *   $facet   -> run two sub-pipelines over the same matched votes:
 *                 voters    : $group by poll              -> distinct voters per poll
 *                 perOption : $unwind choices, $group     -> votes per (poll, option)
 *
 * Options nobody picked are filled with 0 afterwards, so the client always gets every bar.
 */
export async function getResultsMany(polls: PollRef[]): Promise<Map<string, PollResults>> {
  const out = new Map<string, PollResults>(polls.map((p) => [String(p._id), emptyResults(p)]));
  if (polls.length === 0) return out;

  const [agg] = await Vote.aggregate<{
    voters: { _id: Types.ObjectId; n: number }[];
    perOption: { _id: { poll: Types.ObjectId; choice: string }; n: number }[];
  }>([
    { $match: { poll: { $in: polls.map((p) => p._id) } } },
    {
      $facet: {
        voters: [{ $group: { _id: '$poll', n: { $sum: 1 } } }],
        perOption: [
          { $unwind: '$choices' },
          { $group: { _id: { poll: '$poll', choice: '$choices' }, n: { $sum: 1 } } },
        ],
      },
    },
  ]);

  for (const v of agg?.voters ?? []) {
    const r = out.get(String(v._id));
    if (r) r.totalVoters = v.n;
  }
  for (const c of agg?.perOption ?? []) {
    const r = out.get(String(c._id.poll));
    if (r && c._id.choice in r.counts) r.counts[c._id.choice] = c.n;
  }
  return out;
}

export async function getResults(poll: PollRef): Promise<PollResults> {
  const map = await getResultsMany([poll]);
  return map.get(String(poll._id)) ?? emptyResults(poll);
}
