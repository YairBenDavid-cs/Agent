import type { ReactElement } from 'react';
import type { SlotCandidate } from '@/pages/AssistantPage/domain/assistant/types/assistant';
import styles from './SlotProposal.module.css';

interface SlotProposalProps {
  candidates: SlotCandidate[];
  // Disabled while a pick is in flight (a turn is posting).
  disabled: boolean;
  onPick: (scheduledStartUtc: string) => void;
}

// Human-readable "Mon Jul 6, 07:00–08:00" label for one candidate. The date is
// rendered in UTC to match the backend's slot labels (the time-of-day strings are
// already local wall-clock times the planner produced).
function formatLabel(c: SlotCandidate): string {
  const weekday = new Date(`${c.scheduledDate}T00:00:00.000Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `${weekday}, ${c.startTime}–${c.endTime}`;
}

/**
 * The calendar-slot picker for a build session. Renders the coach's proposed
 * times as selectable chips; picking one confirms it (confirm-slot) and advances
 * the build. Only the latest outstanding proposal is shown (older ones are spent
 * once their session is scheduled).
 */
export function SlotProposal({ candidates, disabled, onPick }: SlotProposalProps): ReactElement {
  return (
    <div className={styles.panel}>
      <span className={styles.label}>Pick a time for this session</span>
      <div className={styles.chips}>
        {candidates.map((c) => (
          <button
            key={c.scheduledStartUtc}
            type="button"
            className={styles.chip}
            disabled={disabled}
            onClick={() => onPick(c.scheduledStartUtc)}
          >
            {formatLabel(c)}
          </button>
        ))}
      </div>
    </div>
  );
}
