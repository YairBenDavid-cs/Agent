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

/* ── Step-A weekly quota enforcement ───────────────────────────── */

/** The frozen weekly budget a per-session draft must fit inside (Step A). */
export interface WeeklyTargetsCheck {
  sessionCount: number;
  totalVolume: number; // native units: km (running) or volume-load (strength)
}

/**
 * Native (un-weighted) volume contribution of one train, in the discipline's
 * own unit so it sums against a `WeeklyTargets.totalVolume` budget: kilometres
 * for running, volume-load (kg·reps) for strength. Sessions without an explicit
 * target contribute 0 (the budget tracks prescribed volume, not effort).
 */
export function sessionVolume(s: LoadProxyInput): number {
  if (s.type === 'running' && s.running?.totalDistanceKm) {
    return s.running.totalDistanceKm;
  }
  if (s.type === 'strength' && s.strength?.targetVolumeLoad) {
    return s.strength.targetVolumeLoad;
  }
  return 0;
}

/**
 * Step-B quota guardrail: a newly-drafted session, added to the sessions already
 * committed this week, must not overshoot the locked weekly targets — neither
 * the session COUNT nor the native VOLUME budget. A non-empty list bounces the
 * draft back into the loop so the model trims it to fit the frozen quota.
 *
 * Pure: the caller supplies the already-committed sessions; this never reads I/O.
 */
export function validateAgainstWeeklyTargets(
  proposed: LoadProxyInput,
  committedSoFar: LoadProxyInput[],
  targets: WeeklyTargetsCheck,
): string[] {
  const EPSILON = 1e-6;
  const violations: string[] = [];

  const count = committedSoFar.length + 1;
  if (count > targets.sessionCount) {
    violations.push(
      `Adding this session makes ${count} sessions, exceeding the locked ` +
        `weekly quota of ${targets.sessionCount}. Fold it into an existing ` +
        `session or drop it.`,
    );
  }

  const committedVolume = committedSoFar.reduce(
    (sum, s) => sum + sessionVolume(s),
    0,
  );
  const total = committedVolume + sessionVolume(proposed);
  if (total > targets.totalVolume + EPSILON) {
    violations.push(
      `Cumulative volume ${total.toFixed(1)} exceeds the locked weekly budget ` +
        `of ${targets.totalVolume.toFixed(1)} (already committed ` +
        `${committedVolume.toFixed(1)}). Reduce this session's volume.`,
    );
  }

  return violations;
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

  // 4. Structured-detail enforcement — a session must be a real, step-by-step
  //    workout, not just a title + prose. Light coherence only; the model
  //    re-plans on a bounce.
  for (const s of args.sessions) {
    violations.push(...validateSessionStructure(s));
  }

  return violations;
}

/**
 * One drafted session must carry concrete structure matching its type: running
 * sessions need non-empty blocks of run/rest steps with a target each; strength
 * sessions need fully-specified exercises with a load anchor. Returns a (possibly
 * empty) list of human-readable violations to bounce back to the model.
 */
export function validateSessionStructure(
  s: UpsertWeekSessionsArgs['sessions'][number],
): string[] {
  const v: string[] = [];
  const tag = `Session "${s.slotKey}"`;

  if (s.type === 'running') {
    if (!s.running) {
      v.push(`${tag} is type running but has no running plan.`);
      return v;
    }
    const blocks = s.running.blocks ?? [];
    if (blocks.length === 0) {
      v.push(`${tag} has no running blocks — emit warmup/work/cooldown steps.`);
      return v;
    }
    blocks.forEach((b, bi) => {
      const steps = b.steps ?? [];
      if (steps.length === 0) {
        v.push(`${tag} block ${bi} (${b.label ?? b.kind}) has no steps.`);
        return;
      }
      steps.forEach((st, si) => {
        const hasTarget =
          (st.distanceM != null && st.distanceM > 0) ||
          (st.durationSec != null && st.durationSec > 0);
        if (!hasTarget) {
          v.push(
            `${tag} block ${bi} step ${si} needs a distance or duration target.`,
          );
        }
      });
    });

    // Soft total-distance coherence: only when totalDistanceKm is declared AND
    // every run step is distance-based (mixed distance/duration is left alone).
    const runSteps = blocks.flatMap((b) =>
      (b.steps ?? [])
        .filter((st) => st.type === 'run')
        .map((st) => ({ d: st.distanceM, repeat: b.repeat ?? 1 })),
    );
    if (
      s.running.totalDistanceKm &&
      runSteps.length > 0 &&
      runSteps.every((r) => r.d != null && r.d > 0)
    ) {
      const summedKm =
        runSteps.reduce((sum, r) => sum + (r.d as number) * r.repeat, 0) / 1000;
      const declared = s.running.totalDistanceKm;
      if (Math.abs(summedKm - declared) > declared * 0.25) {
        v.push(
          `${tag} totalDistanceKm ${declared} disagrees with summed step ` +
            `distance ${summedKm.toFixed(1)}km (>25%). Reconcile the two.`,
        );
      }
    }
  }

  if (s.type === 'strength') {
    if (!s.strength) {
      v.push(`${tag} is type strength but has no strength plan.`);
      return v;
    }
    const exercises = s.strength.exercises ?? [];
    if (exercises.length === 0) {
      v.push(`${tag} has no exercises — prescribe sets/reps/load.`);
      return v;
    }
    exercises.forEach((e) => {
      if (e.sets < 1) v.push(`${tag} exercise "${e.name}" needs sets >= 1.`);
      if (e.targetRepsMin > e.targetRepsMax) {
        v.push(`${tag} exercise "${e.name}" has repsMin > repsMax.`);
      }
      const hasLoadAnchor =
        e.targetWeightKg != null ||
        e.targetPct1rm != null ||
        e.targetRir != null;
      if (!hasLoadAnchor) {
        v.push(
          `${tag} exercise "${e.name}" needs a load anchor ` +
            `(targetWeightKg, targetPct1rm, or targetRir).`,
        );
      }
    });
  }

  return v;
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
