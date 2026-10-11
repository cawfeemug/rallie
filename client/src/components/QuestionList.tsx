import type { Question } from '../types';
import { sortQuestions } from '../util';

interface Props {
  questions: Question[];
  /** participant: can upvote. host: can mark answered and delete. view: read only (projector). */
  mode: 'participant' | 'host' | 'view';
  large?: boolean;
  limit?: number;
  disabled?: boolean;
  emptyText?: string;
  onUpvote?: (id: string) => void;
  onAnswered?: (id: string, answered: boolean) => void;
  onDelete?: (id: string) => void;
}

export function QuestionList({
  questions,
  mode,
  large = false,
  limit,
  disabled = false,
  emptyText = 'No questions yet.',
  onUpvote,
  onAnswered,
  onDelete,
}: Props) {
  const sorted = sortQuestions(questions);
  const visible = limit ? sorted.slice(0, limit) : sorted;

  if (visible.length === 0) return <p className="empty">{emptyText}</p>;

  return (
    <ul className={large ? 'questions questions-large' : 'questions'}>
      {visible.map((q) => (
        <li key={q.id} className={q.answered ? 'question question-answered' : 'question'}>
          {mode === 'participant' ? (
            <button
              type="button"
              className="upvote"
              aria-pressed={q.upvoted}
              aria-label={`${q.upvoted ? 'Remove your upvote from' : 'Upvote'} this question. ${q.upvotes} so far.`}
              disabled={disabled}
              onClick={() => onUpvote?.(q.id)}
            >
              <span aria-hidden="true">▲</span>
              <span>{q.upvotes}</span>
            </button>
          ) : (
            <div className="upvote upvote-static" aria-label={`${q.upvotes} upvotes`}>
              <span aria-hidden="true">▲</span>
              <span>{q.upvotes}</span>
            </div>
          )}

          <div>
            <p className="question-text">{q.text}</p>
            <p className="question-meta">
              {q.authorName}
              {q.answered ? ' · Answered' : ''}
            </p>
            {mode === 'host' && (
              <div className="question-actions">
                <button type="button" className="btn btn-sm" onClick={() => onAnswered?.(q.id, !q.answered)}>
                  {q.answered ? 'Mark unanswered' : 'Mark answered'}
                </button>
                <button type="button" className="btn btn-sm btn-quiet btn-danger" onClick={() => onDelete?.(q.id)}>
                  Delete
                </button>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
