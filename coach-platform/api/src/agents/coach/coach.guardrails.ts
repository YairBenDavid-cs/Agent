import { CommitSkeletonArgs, UpsertWeekSessionsArgs } from './coach.contracts';

/**
 * Code-side post-generation guardrails — the enforcing half of defense in
 * depth. The Coach's system prompt ASKS for safe load progression; these pure
 * functions REFUSE to persist a week that violates the hard numeric limits.
 *
 * A non-empty violation list is thrown back into the agentic loop (validator-
 * bounce) so the model re-plans within bounds, capped by the iteration limit.
 */

/** Readiness band a Recovery Guru verdict carries (only what guardrails need). */
export type ReadinessBand = 'green' | 'amber' | 'red';

export interface WeekGuardrailContext {
  /** Prior committed week's intended load, for the ≤10% progression cap. */
  priorWeekLoad: number | null;
  /** This week's skeleton theme — deload weeks are EXPECTED to drop load. */
  weekTheme: string | null;
  /** Latest Recovery Guru band; caps intensity when not green. */
  readiness: ReadinessBand | null;
}

/** Hard limits (mirror the Coach prompt + Recovery thresholds). */
export const WEEKLY_LOAD_INCREASE_CAP = 0.1; // ≤ +10% week over week
export const MAX_HARD_SESSIONS_AMBER = 1; // amber: at most one hard day
export const MIN_DELOAD_EVERY_WEEKS = 4; // mandatory deload cadence

/**
 * Minimal structural shape the load proxy reads. Both a freshly-drafted session
 * and a persisted `PlannedSessionResponse` satisfy it, so prior weeks and the
 * proposed week are scored in the SAME units (apples to apples).
 */
export interface LoadProxyInput {
  type: string;
  intensityLabel: string;
  estDurationMin: number;
  running: { totalDistanceKm: number | null } | null;
  strength: { targetVolumeLoad: number | null } | null;
}

/**
 * A relative load proxy for one train. Prefers explicit targets (distance /
 * strength volume) and falls back to duration × intensity weight so every
 * session contributes a comparable scalar.
 */
export function sessionLoadProxy(s: LoadProxyInput): number {
  const intensityWeight =
    s.intensityLabel === 'hard' ? 2 : s.intensityLabel === 'moderate' ? 1.5 : 1;

  if (s.type === 'running' && s.running) {
    if (s.running.totalDistanceKm && s.running.totalDistanceKm > 0) {
      return s.running.totalDistanceKm * intensityWeight;
    }
  }
  if (s.type === 'strength' && s.strength) {
    if (s.strength.targetVolumeLoad && s.strength.targetVolumeLoad > 0) {
      // Normalise volume load (kg·reps) into the same rough band as km.
      return (s.strength.targetVolumeLoad / 1000) * intensityWeight;
    }
  }
  // Duration fallback: minutes → ~km-equivalent (÷6) × intensity.
  return (s.estDurationMin / 6) * intensityWeight;
}

export function weekLoadProxy(sessions: LoadProxyInput[]): number {
  return sessions.reduce((sum, s) => sum + sessionLoadProxy(s), 0);
}

/** Validate a proposed week of sessions against the hard limits. */
export function validateWeek(
  args: UpsertWeekSessionsArgs,
  ctx: WeekGuardrailContext,
): string[] {
  const violations: string[] = [];
  const isDeload = ctx.weekTheme === 'deload' || ctx.weekTheme === 'taper';

  // 1. Weekly load progression cap (skipped on a deload — load is meant to drop).
  if (!isDeload && ctx.priorWeekLoad && ctx.priorWeekLoad > 0) {
    const proposed = weekLoadProxy(args.sessions);
    const ceiling = ctx.priorWeekLoad * (1 + WEEKLY_LOAD_INCREASE_CAP);
    if (proposed > ceiling) {
      violations.push(
        `Weekly load ${proposed.toFixed(1)} exceeds the +${
          WEEKLY_LOAD_INCREASE_CAP * 100
        }% cap (prior ${ctx.priorWeekLoad.toFixed(1)}, ceiling ${ceiling.toFixed(
          1,
        )}). Reduce volume/intensity.`,
      );
    }
  }

  // 2. Intensity cap driven by the Recovery Guru's band.
  const hardCount = args.sessions.filter(
    (s) => s.intensityLabel === 'hard',
  ).length;
  if (ctx.readiness === 'red' && hardCount > 0) {
    violations.push(
      `Recovery is RED: no hard sessions allowed this week, found ${hardCount}. Convert to easy/moderate or rest.`,
    );
  }
  if (ctx.readiness === 'amber' && hardCount > MAX_HARD_SESSIONS_AMBER) {
    violations.push(
      `Recovery is AMBER: at most ${MAX_HARD_SESSIONS_AMBER} hard session, found ${hardCount}. Ease the surplus.`,
    );
  }

  // 3. Each train must carry its rationale (also re-checked at the command).
  for (const s of args.sessions) {
    if (!s.coachNotes || s.coachNotes.trim().length === 0) {
      violations.push(`Session "${s.slotKey}" is missing coachNotes.`);
    }
  }

  return violations;
}

/** Validate the periodization skeleton: mandatory deload cadence. */
export function validateSkeleton(args: CommitSkeletonArgs): string[] {
  const violations: string[] = [];
  const weeks = [...args.weeks].sort((a, b) => a.weekIndex - b.weekIndex);

  // Mandatory deload at least every MIN_DELOAD_EVERY_WEEKS consecutive non-deload weeks.
  let sinceDeload = 0;
  for (const w of weeks) {
    if (w.theme === 'deload' || w.theme === 'taper') {
      sinceDeload = 0;
      continue;
    }
    sinceDeload += 1;
    if (sinceDeload > MIN_DELOAD_EVERY_WEEKS) {
      violations.push(
        `No deload within ${MIN_DELOAD_EVERY_WEEKS} weeks before week ${w.weekIndex}. Insert a deload/taper.`,
      );
      break;
    }
  }

  // Exactly one current week, matching currentWeekIndex.
  const currentWeeks = weeks.filter((w) => w.status === 'current');
  if (currentWeeks.length !== 1) {
    violations.push(
      `Exactly one week must have status "current", found ${currentWeeks.length}.`,
    );
  } else if (currentWeeks[0].weekIndex !== args.currentWeekIndex) {
    violations.push(
      `currentWeekIndex ${args.currentWeekIndex} does not match the week marked "current" (${currentWeeks[0].weekIndex}).`,
    );
  }

  return violations;
}
