import type { ReactElement } from 'react';
import type { PlannedSession } from '../../domain/types';
import { formatTimeRange, statusLabel } from '../../domain/format';
import { WorkoutBody } from '../WorkoutBody/WorkoutBody';
import styles from './TrainCard.module.css';

interface TrainCardProps {
  session: PlannedSession;
  // Deep-link this session into chat with a prefilled reference. Optional so the
  // card stays usable in read-only contexts (review surface, tests).
  onDiscuss?: (session: PlannedSession) => void;
}

// One planned train. Renders the running OR strength prescription (via the
// shared WorkoutBody) plus the recorded outcome, when the matcher / self-report
// has attached one.
export function TrainCard({ session, onDiscuss }: TrainCardProps): ReactElement {
  const { outcome } = session;
  const done = outcome.status !== 'planned';

  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <div className={styles.headTop}>
          <h3 className={styles.title}>{session.title}</h3>
          <span className={`${styles.status} ${styles[outcome.status]}`}>
            {statusLabel(outcome.status)}
          </span>
        </div>
        <span className={styles.meta}>
          {session.scheduledDate} · {formatTimeRange(session.startTime, session.endTime)} ·{' '}
          {session.estDurationMin} min · {session.intensityLabel}
        </span>
        {session.coachNotes !== null && <p className={styles.desc}>{session.coachNotes}</p>}
      </div>

      <WorkoutBody session={session} />

      {done && (
        <div className={styles.outcome}>
          {outcome.perceivedEffort !== null && (
            <span className={styles.outcomeChip}>Effort {outcome.perceivedEffort}/10</span>
          )}
          {outcome.enjoyment !== null && (
            <span className={styles.outcomeChip}>Enjoyment {outcome.enjoyment}/5</span>
          )}
          {outcome.reasonCode !== null && (
            <span className={styles.outcomeChip}>{outcome.reasonCode.replace(/_/g, ' ')}</span>
          )}
        </div>
      )}

      {onDiscuss !== undefined && (
        <div className={styles.actions}>
          <button type="button" className={styles.discuss} onClick={() => onDiscuss(session)}>
            Discuss in chat
          </button>
        </div>
      )}
    </article>
  );
}
