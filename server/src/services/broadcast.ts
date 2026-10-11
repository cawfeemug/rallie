import type { Types } from 'mongoose';
import { config } from '../config';
import type { Realtime } from '../realtime';
import { getResults } from './results';

type PollRef = { _id: Types.ObjectId; options: ReadonlyArray<{ id: string }> };

const pending = new Map<string, NodeJS.Timeout>();

/**
 * Trailing throttle for live results. If 200 people vote in the same second we run the
 * aggregation and broadcast once per window (not 200 times), and the message that goes
 * out always contains the newest tally because it is computed when the timer fires.
 */
export function scheduleResults(realtime: Realtime, code: string, poll: PollRef, delayMs?: number): void {
  const key = String(poll._id);
  if (pending.has(key)) return;

  const delay = delayMs ?? (config.isTest ? 0 : 150);
  const timer = setTimeout(async () => {
    pending.delete(key);
    try {
      realtime.emit(code, 'poll:results', await getResults(poll));
    } catch (err) {
      console.error('[broadcast] failed to publish results', err);
    }
  }, delay);
  timer.unref();
  pending.set(key, timer);
}
