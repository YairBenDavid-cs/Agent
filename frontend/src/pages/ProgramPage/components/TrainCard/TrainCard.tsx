import type { ReactElement } from 'react';
import type { PlannedSession } from '../../domain/types';
import {
  formatSegment,
  formatTimeRange,
  segmentKindLabel,
  statusLabel,
} from '../../domain/format';
import styles from './TrainCard.module.css';

interface TrainCardProps {
  session: PlannedSession;
}

// One planned train. Renders the running OR strength prescription plus the
// recorded outcome (when the matcher / self-report has attached one).
export function TrainCard({ session }: TrainCardProps): ReactElement {
  const { running, strength, outcome } = session;
  const done = outcome.status !== 'planned';

  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <span className={`${styles.typeDot} ${styles[session.type]}`} aria-hidden />
        <div className={styles.headText}>
          <h3 className={styles.title}>{session.title}</h3>
          <span className={styles.meta}>
            {formatTimeRange(session.startTime, session.endTime)} · {session.estDurationMin} min ·{' '}
            {session.intensityLabel}
          </span>
        </div>
        <span className={`${styles.status} ${styles[outcome.status]}`}>
          {statusLabel(outcome.status)}
        </span>
      </div>

      {running !== null && (
        <div className={styles.body}>
          <div className={styles.targets}>
            {running.totalDistanceKm !== null && (
              <Target label="Distance" value={`${running.totalDistanceKm} km`} />
            )}
            {running.targetPace !== null && <Target label="Pace" value={running.targetPace} />}
            {running.targetHrZone !== null && (
              <Target label="HR zone" value={`Z${running.targetHrZone}`} />
            )}
            {running.targetRpe !== null && <Target label="RPE" value={`${running.targetRpe}/10`} />}
          </div>
          {running.segments.length > 0 && (
            <ul className={styles.segments}>
              {running.segments.map((seg, i) => (
                <li key={i} className={styles.segment}>
                  <span className={styles.segmentKind}>{segmentKindLabel(seg.kind)}</span>
                  <span className={styles.segmentDetail}>{formatSegment(seg)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {strength !== null && (
        <div className={styles.body}>
          {strength.splitFocus !== null && (
            <div className={styles.targets}>
              <Target label="Focus" value={strength.splitFocus} />
              {strength.targetVolumeLoad !== null && (
                <Target label="Volume" value={`${strength.targetVolumeLoad} kg`} />
              )}
            </div>
          )}
          <ul className={styles.segments}>
            {strength.exercises.map((ex, i) => (
              <li key={i} className={styles.segment}>
                <span className={styles.segmentKind}>{ex.name}</span>
                <span className={styles.segmentDetail}>
                  {ex.sets} × {ex.targetRepsMin}
                  {ex.targetRepsMax !== ex.targetRepsMin ? `–${ex.targetRepsMax}` : ''}
                  {ex.targetWeightKg !== null ? ` @ ${ex.targetWeightKg}kg` : ''}
                  {ex.targetRir !== null ? ` · RIR ${ex.targetRir}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {session.coachNotes !== null && <p className={styles.notes}>{session.coachNotes}</p>}

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
    </article>
  );
}

function Target({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className={styles.target}>
      <span className={styles.targetValue}>{value}</span>
      <span className={styles.targetLabel}>{label}</span>
    </div>
  );
}
