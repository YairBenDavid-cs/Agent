import { type ReactElement } from 'react';
import type { PlannedSession } from '../../domain/types';
import type { ApprovalBatchView } from '../../api/approvalsApi';
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
  onReject: () => void;
}

/**
 * The review surface for a freshly-generated tentative week. Each session is a
 * full workout card; the user approves (commit + sync) or rejects (discard).
 * Revise was removed in the dual-mode redesign — to change a session, the user
 * discusses it in Plan-mode chat, which re-plans and produces a fresh draft.
 */
export function WeekReview({
  batch,
  sessions,
  pending,
  error,
  onApprove,
  onReject,
}: WeekReviewProps): ReactElement {
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  const canApprove = batch.allowedActions.includes('approve');
  const canReject = batch.allowedActions.includes('reject');

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
          Happy with it? <strong>Approve</strong> to lock it in and add it to your calendar. Want
          changes? Tell your coach in chat and they’ll re-plan the week.
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
            </div>
          );
        })}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <footer className={styles.actions}>
        <button
          type="button"
          className={styles.approve}
          onClick={onApprove}
          disabled={pending || !canApprove}
        >
          {pending ? 'Working…' : 'Approve'}
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
