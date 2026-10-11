import { useState, type FormEvent } from 'react';
import type { NewPoll } from '../api';
import type { PollType } from '../types';
import { errMsg } from '../util';

interface Props {
  onCreate: (poll: NewPoll) => Promise<void>;
  onCancel: () => void;
}

const MAX_OPTIONS = 10;

export function PollForm({ onCreate, onCancel }: Props) {
  const [question, setQuestion] = useState('');
  const [type, setType] = useState<PollType>('single');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const canSubmit = question.trim().length >= 3 && filled.length >= 2 && !busy;

  const setOption = (index: number, value: string) =>
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({ question: question.trim(), type, options: filled });
      setQuestion('');
      setOptions(['', '']);
      setType('single');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="poll-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="poll-question">Question</label>
        <input
          id="poll-question"
          className="input"
          value={question}
          maxLength={200}
          placeholder="What should we cover first?"
          onChange={(e) => setQuestion(e.target.value)}
          autoFocus
        />
      </div>

      <fieldset className="choices" style={{ gap: '0.5rem' }}>
        <legend className="label" style={{ marginBottom: '0.4rem' }}>
          Options
        </legend>
        {options.map((value, i) => (
          <div className="option-row" key={i}>
            <input
              className="input"
              value={value}
              maxLength={100}
              placeholder={`Option ${i + 1}`}
              aria-label={`Option ${i + 1}`}
              onChange={(e) => setOption(i, e.target.value)}
            />
            {options.length > 2 && (
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove option ${i + 1}`}
                onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {options.length < MAX_OPTIONS && (
          <div>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setOptions((prev) => [...prev, ''])}>
              Add option
            </button>
          </div>
        )}
      </fieldset>

      <div className="field">
        <span className="label" id="poll-type-label">
          Voters can pick
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby="poll-type-label">
          <label>
            <input type="radio" name="poll-type" checked={type === 'single'} onChange={() => setType('single')} />
            One option
          </label>
          <label>
            <input type="radio" name="poll-type" checked={type === 'multiple'} onChange={() => setType('multiple')} />
            Several options
          </label>
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          {busy ? 'Creating…' : 'Create poll'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
