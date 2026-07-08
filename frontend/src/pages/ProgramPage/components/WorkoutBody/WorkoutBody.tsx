import type { ReactElement } from 'react';
import type {
  PlannedExercise,
  PlannedSession,
  RunningPlan,
  RunStep,
  StrengthPlan,
} from '../../domain/types';
import {
  blockLabel,
  formatLoad,
  formatReps,
  formatRest,
  formatStepMeasure,
  groupSupersets,
} from '../../domain/format';
import styles from './WorkoutBody.module.css';

interface WorkoutBodyProps {
  // Only the prescription body is read, so any session-like carrier works
  // (PlannedSession on the program page, ApprovalCard in the chat card).
  session: Pick<PlannedSession, 'running' | 'strength'>;
  // Optional extra class on the root (used by callers to add padding).
  className?: string | undefined;
}

/**
 * The structured workout body shared by the committed cards (TrainCard) and the
 * review surface (WeekReview). Running renders as blocks (Warm-Up / Repeat ×N /
 * Cool-Down) where each step is its own rounded card with a run row + optional
 * rest row; strength renders as numbered exercise cards with Sets/Reps/Load/
 * Rest/RIR chips, supersets grouped under an accent pill.
 *
 * Legacy guard: a pre-migration session with no structured detail renders
 * nothing here — the card head already shows the coach's prose rationale.
 */
export function WorkoutBody({ session, className }: WorkoutBodyProps): ReactElement | null {
  const { running, strength } = session;

  if (running !== null && running.blocks.length > 0) {
    return <RunningBody plan={running} className={className} />;
  }
  if (strength !== null && strength.exercises.length > 0) {
    return <StrengthBody plan={strength} className={className} />;
  }
  return null;
}

/* ── Running ────────────────────────────────────────────────────── */

interface StepCard {
  primary: RunStep;
  rest: RunStep | null;
}

// Fold a block's steps into cards: each active step is a card, pairing the rest
// that immediately follows it into the same card (mirrors the design's run +
// rest layout). A leading/standalone rest becomes its own card.
function toStepCards(steps: RunStep[]): StepCard[] {
  const cards: StepCard[] = [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (step === undefined || step.type === 'rest') {
      if (step !== undefined) cards.push({ primary: step, rest: null });
      continue;
    }
    const next = steps[i + 1];
    if (next !== undefined && next.type === 'rest') {
      cards.push({ primary: step, rest: next });
      i += 1;
    } else {
      cards.push({ primary: step, rest: null });
    }
  }
  return cards;
}

// A concrete pace ("4:30/km") reads as "at 4:30/km"; a qualitative cue
// ("conversational", "easy build") reads on its own.
function paceDescriptor(pace: string | null): string {
  if (pace === null) return '';
  return pace.includes('/') ? `at ${pace}` : pace;
}

function RunningBody({
  plan,
  className,
}: {
  plan: RunningPlan;
  className?: string | undefined;
}): ReactElement {
  let n = 0;
  return (
    <div className={`${styles.sections} ${className ?? ''}`}>
      {plan.blocks.map((block, bi) => {
        const isRepeat = block.repeat > 1;
        const cards = toStepCards(block.steps);
        return (
          <div key={bi} className={styles.section}>
            <span className={isRepeat ? styles.repeatPill : styles.sectionPill}>
              {isRepeat && <RepeatIcon />}
              {blockLabel(block)}
            </span>
            {cards.map((card) => {
              n += 1;
              return <RunStepCard key={n} num={n} card={card} />;
            })}
          </div>
        );
      })}
    </div>
  );
}

function RunStepCard({ num, card }: { num: number; card: StepCard }): ReactElement {
  const { primary, rest } = card;
  const isRest = primary.type === 'rest';
  const descriptor = paceDescriptor(primary.targetPace);
  return (
    <div className={styles.step}>
      <div className={styles.stepRow}>
        <span className={styles.num}>{num}</span>
        <div className={styles.stepBody}>
          <div className={styles.stepLine}>
            <strong className={styles.amount}>{formatStepMeasure(primary)}</strong>
            {descriptor && <span className={styles.qual}> {descriptor}</span>}
          </div>
          {primary.note !== null && <div className={styles.note}>{primary.note}</div>}
        </div>
        {isRest ? (
          <span className={styles.restBadge}>REST</span>
        ) : (
          <span className={styles.runBadge}>
            <RunnerIcon />
            RUN
          </span>
        )}
      </div>
      {rest !== null && (
        <div className={styles.restRow}>
          <span className={styles.num} aria-hidden />
          <div className={styles.stepBody}>
            <div className={styles.stepLine}>
              <strong className={styles.amount}>{formatStepMeasure(rest)}</strong>
            </div>
            {rest.note !== null && <div className={styles.note}>{rest.note}</div>}
          </div>
          <span className={styles.restBadge}>REST</span>
        </div>
      )}
    </div>
  );
}

/* ── Strength ───────────────────────────────────────────────────── */

function StrengthBody({
  plan,
  className,
}: {
  plan: StrengthPlan;
  className?: string | undefined;
}): ReactElement {
  const groups = groupSupersets(plan.exercises);
  let n = 0;
  return (
    <div className={`${styles.sections} ${className ?? ''}`}>
      {groups.map((group, gi) => {
        const isSuperset = group.supersetGroup !== null && group.exercises.length > 1;
        n += 1;
        const num = n;
        return (
          <div key={gi} className={styles.section}>
            {isSuperset && (
              <span className={styles.repeatPill}>
                <SupersetIcon />
                {supersetLabel(group.supersetGroup)}
              </span>
            )}
            <div className={styles.step}>
              {group.exercises.map((ex, ei) => (
                <div key={ei} className={ei === 0 ? styles.stepRow : styles.restRow}>
                  <span className={styles.num}>{ei === 0 ? num : ''}</span>
                  <div className={styles.stepBody}>
                    <div className={styles.exName}>{ex.name}</div>
                    {ex.tempo !== null && <div className={styles.note}>Tempo {ex.tempo}</div>}
                    <ExerciseChips ex={ex} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExerciseChips({ ex }: { ex: PlannedExercise }): ReactElement {
  return (
    <div className={styles.chips}>
      <Chip label="Sets" value={`${ex.sets}`} />
      <Chip label="Reps" value={formatReps(ex)} />
      <Chip label="Load" value={formatLoad(ex)} accent />
      <Chip label="Rest" value={formatRest(ex.restSec)} />
      <Chip label="RIR" value={ex.targetRir !== null ? `${ex.targetRir}` : '—'} />
    </div>
  );
}

function Chip({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}): ReactElement {
  return (
    <div className={styles.chip}>
      <span className={`${styles.chipValue} ${accent ? styles.chipAccent : ''}`}>{value}</span>
      <span className={styles.chipLabel}>{label}</span>
    </div>
  );
}

// `supersetGroup` is a free label. Avoid "Superset Superset A" when it already
// reads like one.
function supersetLabel(group: string | null): string {
  if (group === null) return 'Superset';
  return /superset/i.test(group) ? group : `Superset ${group}`;
}

/* ── Icons (inline, accent-aware via currentColor) ──────────────── */

function RepeatIcon(): ReactElement {
  return (
    <svg
      className={styles.pillIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function SupersetIcon(): ReactElement {
  return (
    <svg
      className={styles.pillIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
      <path d="M8 12h8" />
    </svg>
  );
}

function RunnerIcon(): ReactElement {
  return (
    <svg
      className={styles.badgeIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="13.5" cy="4" r="1.7" fill="currentColor" stroke="none" />
      <path d="M5 21l3.2-5.2 3 2.1 1-4.3" />
      <path d="M6.5 10.5l4.3-2.2 3 3.1 3.2 0" />
    </svg>
  );
}
