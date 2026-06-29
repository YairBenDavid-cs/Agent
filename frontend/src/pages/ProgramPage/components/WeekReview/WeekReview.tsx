import { useState, type ReactElement } from 'react';
import type { PlannedSession } from '../../domain/types';
import type { ApprovalBatchView, CardRevisionEdit } from '../../api/approvalsApi';
import { WorkoutBody } from '../WorkoutBody/WorkoutBody';
import styles from './WeekReview.module.css';

interface WeekReviewProps {
  batch: ApprovalBatchView;
  // The week's planned sessions — joined to the batch cards by id so each
  // review card can render the full workout, not just the header.
  sessions: PlannedSession[];
  pending: boolean;
  error: string | null;
  onApprove: () => void;
  onRevise: (edits: CardRevisionEdit[]) => void;
  onReject: () => void;
}

/**
 * The review surface for a freshly-generated tentative week. Each session is a
 * full workout card with a free-text note box; the user's default move is to
 * revise (per-card feedback → the coach re-plans), with approve (commit + sync)
 * and reject (discard) as the other two terminal actions the backend allows.
 */
export function WeekReview({
  batch,
  sessions,
  pending,
  error,
  onApprove,
  onRevise,
  onReject,
}: WeekReviewProps): ReactElement {
  const [comments, setComments] = useState<Record<string, string>>({});

  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  const edits: CardRevisionEdit[] = batch.cards
    .map((card) => ({
      plannedSessionId: card.sessionId,
      freeText: (comments[card.sessionId] ?? '').trim(),
    }))
    .filter((edit) => edit.freeText.length > 0);

  const canApprove = batch.allowedActions.includes('approve');
  const canReject = batch.allowedActions.includes('reject');
  const canRevise = batch.allowedActions.includes('revise') && edits.length > 0;

  if (batch.status === 'approved') {
    return (
      <section className={styles.panel}>
        <div className={styles.approved}>
          <CheckIcon />
          Week approved — added to your calendar.
        </div>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <header className={styles.head}>
        <h2 className={styles.title}>Review your week</h2>
        <p className={styles.hint}>
          Leave a note on any session to tell your coach what to change, then{' '}
          <strong>Revise</strong>. Happy with it? <strong>Approve</strong> to lock it in and add it
          to your calendar.
        </p>
      </header>

      <div className={styles.cards}>
        {batch.cards.map((card) => {
          const session = sessionById.get(card.sessionId);
          return (
            <div key={card.sessionId} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}>{card.title}</span>
                <span className={styles.cardMeta}>
                  {card.scheduledDate} · {card.startTime} · {card.intensityLabel}
                </span>
                {card.coachNotes && <p className={styles.coachNotes}>{card.coachNotes}</p>}
              </div>

              {session && <WorkoutBody session={session} />}

              <textarea
                className={styles.input}
                placeholder="Tell your coach what to change about this session…"
                value={comments[card.sessionId] ?? ''}
                onChange={(e) =>
                  setComments((prev) => ({ ...prev, [card.sessionId]: e.target.value }))
                }
                disabled={pending}
                rows={2}
              />
            </div>
          );
        })}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <footer className={styles.actions}>
        <button
          type="button"
          className={styles.revise}
          onClick={() => onRevise(edits)}
          disabled={pending || !canRevise}
        >
          {pending ? 'Working…' : 'Revise'}
        </button>
        <button
          type="button"
          className={styles.approve}
          onClick={onApprove}
          disabled={pending || !canApprove}
        >
          Approve
        </button>
        {canReject && (
          <button type="button" className={styles.reject} onClick={onReject} disabled={pending}>
            Reject
          </button>
        )}
      </footer>
    </section>
  );
}

function CheckIcon(): ReactElement {
  return (
    <svg
      className={styles.checkIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#fff"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
