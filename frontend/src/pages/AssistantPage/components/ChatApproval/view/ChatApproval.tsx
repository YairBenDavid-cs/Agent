import type { ReactElement } from 'react';
import type { ApprovalBatchView, ApprovalCard } from '@/pages/ProgramPage/api/approvalsApi';
import type { ConversationMode } from '@/pages/AssistantPage/domain/assistant/types/assistant';
import { CheckIcon } from '@/shared/ui/icons/CheckIcon';
import styles from './ChatApproval.module.css';

interface ChatApprovalProps {
  batch: ApprovalBatchView;
  mode: ConversationMode;
  actionPending: boolean;
  actionError: string | null;
  onApprove: () => void;
  onReject: () => void;
  onSwitchToPlan: () => void;
  onRefresh: () => void;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// scheduledDate is a 'YYYY-MM-DD' string; parse the parts directly so the
// weekday isn't shifted by the local timezone.
function weekday(scheduledDate: string): string {
  const [y, m, d] = scheduledDate.split('-').map(Number);
  if (!y || !m || !d) return '';
  return WEEKDAYS[new Date(y, m - 1, d).getDay()] ?? '';
}

const StarIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2l2.3 6.4L21 11l-6.7 2.6L12 20l-2.3-6.4L3 11l6.7-2.6z" />
  </svg>
);

// Orange forward-arrow that leads the new/kept session line.
const ArrowIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h13M12 5l7 7-7 7" />
  </svg>
);

// Minus that leads a removed session line (rendered struck-through).
const MinusIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M5 12h14" />
  </svg>
);

const InfoIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
);

// Show only the sessions that changed (decision: changed session only, no
// before/after). A fresh weekly plan marks every card `new`, so when nothing is
// flagged as changed we fall back to showing the whole batch.
function cardsToShow(batch: ApprovalBatchView): ApprovalCard[] {
  const changed = batch.cards.filter((c) => c.diffStatus !== 'unchanged');
  return changed.length > 0 ? changed : batch.cards;
}

function CardBody({ cards }: { cards: ApprovalCard[] }): ReactElement {
  return (
    <div className={styles.cards}>
      {cards.map((card, i) => {
        const removed = card.diffStatus === 'removed';
        const day = weekday(card.scheduledDate);
        return (
          <div key={card.sessionId} className={styles.card}>
            <div className={styles.cardEyebrow}>
              Session {i + 1}
              {day && ` · ${day}`}
            </div>
            <div className={removed ? `${styles.cardLine} ${styles.removed}` : styles.cardLine}>
              <span className={removed ? styles.lineIconMuted : styles.lineIcon}>
                {removed ? MinusIcon : ArrowIcon}
              </span>
              <span className={styles.cardTitle}>{card.title}</span>
            </div>
            <span className={styles.cardMeta}>
              {card.scheduledDate} · {card.startTime} · {card.intensityLabel} ·{' '}
              {card.estDurationMin} min
            </span>
            {card.coachNotes && <p className={styles.notes}>{card.coachNotes}</p>}
            {card.placementNote && <p className={styles.placement}>{card.placementNote}</p>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The in-chat review surface for a pending card batch. The card chrome (accent
 * header + session diff) stays fixed across the lifecycle — only the footer
 * swaps between pending actions, an "applied" confirmation, and a "dismissed"
 * note. Approve/reject is the chat-only entry point (the ProgramPage card
 * surface is read-only display). In Ask mode the primary action first switches
 * the conversation to Plan, since applying a change is a Plan capability.
 *
 * A non-`pending`/`approved`/`rejected` batch renders a "superseded" recovery
 * state rather than an error, since a newer plan may have replaced this one.
 */
export function ChatApproval({
  batch,
  mode,
  actionPending,
  actionError,
  onApprove,
  onReject,
  onSwitchToPlan,
  onRefresh,
}: ChatApprovalProps): ReactElement {
  const cards = cardsToShow(batch);
  const isPending = batch.status === 'pending';
  const isApproved = batch.status === 'approved';
  const isRejected = batch.status === 'rejected';

  if (!isPending && !isApproved && !isRejected) {
    // superseded / expired / auto_committed — a newer plan exists.
    return (
      <div className={styles.panel}>
        <Header status="Superseded" />
        <CardBody cards={cards} />
        <div className={styles.footer}>
          <p className={styles.superseded}>This plan was superseded by a newer one.</p>
          <button type="button" className={styles.refresh} onClick={onRefresh}>
            Show the latest
          </button>
        </div>
      </div>
    );
  }

  const isPlan = mode === 'plan';
  const canApprove = batch.allowedActions.includes('approve');
  const canReject = batch.allowedActions.includes('reject');

  const status = isApproved ? 'Applied' : isRejected ? 'Dismissed' : 'Needs approval';

  return (
    <div className={styles.panel}>
      <Header status={status} />
      <CardBody cards={cards} />

      {isPending && actionError && <p className={styles.error}>{actionError}</p>}

      {isPending && (
        <div className={styles.footer}>
          <div className={styles.actions}>
            {canApprove && (
              <button
                type="button"
                className={styles.approve}
                onClick={isPlan ? onApprove : () => { onSwitchToPlan(); onApprove(); }}
                disabled={actionPending}
              >
                {actionPending ? (
                  'Working…'
                ) : (
                  <>
                    <CheckIcon />
                    {isPlan ? 'Approve & apply' : 'Switch to Plan & approve'}
                  </>
                )}
              </button>
            )}
            {canReject && (
              <button
                type="button"
                className={styles.reject}
                onClick={onReject}
                disabled={actionPending}
              >
                Decline
              </button>
            )}
          </div>
          {!isPlan && (
            <p className={styles.askHint}>
              {InfoIcon}
              Approving switches this chat to Plan mode so I can apply it.
            </p>
          )}
        </div>
      )}

      {isApproved && (
        <div className={styles.footer}>
          <div className={styles.applied}>
            <CheckIcon />
            Applied to this week’s plan
          </div>
        </div>
      )}

      {isRejected && (
        <div className={styles.footer}>
          <p className={styles.dismissed}>Suggestion dismissed.</p>
        </div>
      )}
    </div>
  );
}

function Header({ status }: { status: string }): ReactElement {
  return (
    <div className={styles.header}>
      <span className={styles.headerIcon}>{StarIcon}</span>
      <span className={styles.eyebrow}>Suggested change</span>
      <span className={styles.status}>{status}</span>
    </div>
  );
}
