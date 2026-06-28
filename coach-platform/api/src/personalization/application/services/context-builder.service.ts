import { Inject, Injectable } from '@nestjs/common';
import {
  GenerationContext,
  RecoveryContext,
  SchedulingContext,
} from '../../domain/generation-context.model';
import { PERSONALIZATION_CONFIG } from '../../domain/personalization.config';
import {
  HEALTH_CONSTRAINT_REPOSITORY,
  HealthConstraintRepositoryPort,
} from '../../domain/health-constraint.repository.port';
import { PrefEntry } from '../../domain/pref-entry.model';
import {
  EventDiscipline,
  PreferenceEvent,
  PreferenceTagType,
} from '../../domain/preference-event.model';
import {
  PREFERENCE_EVENT_REPOSITORY,
  PreferenceEventRepositoryPort,
} from '../../domain/preference-event.repository.port';
import {
  USER_PREFERENCES_REPOSITORY,
  UserPreferencesRepositoryPort,
} from '../../domain/user-preferences.repository.port';
import {
  flattenGenerationContext,
  flattenRecoveryContext,
  flattenSchedulingContext,
} from './prompt-flattener';

/** Tag types that represent scheduling signals (cross-cutting time concerns). */
const TIME_TAG_TYPES: ReadonlySet<PreferenceTagType> = new Set([
  'disliked_time',
  'time_window_blocked',
  'time_window_preferred',
  'time_constraint',
]);

/** Tag types the recovery guru reasons about (fatigue / illness / overload). */
const SETBACK_TAG_TYPES: ReadonlySet<PreferenceTagType> = new Set([
  'injury',
  'injury_or_illness',
  'too_hard',
  'no_motivation',
]);

/**
 * The read-path assembler. Stitches the three stores into per-agent context
 * slices and renders each into prompt text via the pure flatteners. Every read
 * is tenant-scoped (userId is mandatory on every repo call).
 */
@Injectable()
export class ContextBuilderService {
  constructor(
    @Inject(PREFERENCE_EVENT_REPOSITORY)
    private readonly events: PreferenceEventRepositoryPort,
    @Inject(USER_PREFERENCES_REPOSITORY)
    private readonly projections: UserPreferencesRepositoryPort,
    @Inject(HEALTH_CONSTRAINT_REPOSITORY)
    private readonly constraints: HealthConstraintRepositoryPort,
  ) {}

  /** Coach (generator) slice for one discipline. */
  async buildGenerationContext(
    userId: string,
    discipline: EventDiscipline,
  ): Promise<GenerationContext> {
    const nowIso = new Date().toISOString();
    const [projection, activeOneOffs, recentStandingEvents, healthConstraints] =
      await Promise.all([
        this.projections.findByDiscipline(userId, discipline),
        this.events.findActiveOneOffs(userId, discipline, nowIso),
        this.events.findRecentStanding(
          userId,
          discipline,
          PERSONALIZATION_CONFIG.recentStandingLimit,
        ),
        this.constraints.findActive(userId),
      ]);

    const promptText = flattenGenerationContext({
      discipline,
      projection,
      activeOneOffs,
      recentStandingEvents,
      healthConstraints,
    });

    return {
      userId,
      discipline,
      projection,
      activeOneOffs,
      recentStandingEvents,
      healthConstraints,
      promptText,
    };
  }

  /** Recovery Guru slice — cross-discipline injury + intensity dials + setbacks. */
  async buildRecoveryContext(userId: string): Promise<RecoveryContext> {
    const [healthConstraints, running, strength, recent] = await Promise.all([
      this.constraints.findActive(userId),
      this.projections.findByDiscipline(userId, 'running'),
      this.projections.findByDiscipline(userId, 'strength'),
      this.events.findRecent(userId, {
        limit: PERSONALIZATION_CONFIG.recentStandingLimit,
      }),
    ]);

    const intensityBias = {
      running: running?.intensityBias ?? null,
      strength: strength?.intensityBias ?? null,
    };
    const recentSetbacks = recent.filter((e) =>
      SETBACK_TAG_TYPES.has(e.tag.type),
    );

    const promptText = flattenRecoveryContext({
      healthConstraints,
      intensityBias,
      recentSetbacks,
    });

    return {
      userId,
      healthConstraints,
      intensityBias,
      recentSetbacks,
      promptText,
    };
  }

  /** Planner (scheduler) slice — time windows merged across disciplines. */
  async buildSchedulingContext(userId: string): Promise<SchedulingContext> {
    const nowIso = new Date().toISOString();
    // Time prefs are cross-cutting; either discipline's projection carries the
    // same folded windows, so reading both and merging is robust to either
    // being absent.
    const [running, strength, runningOneOffs, strengthOneOffs] =
      await Promise.all([
        this.projections.findByDiscipline(userId, 'running'),
        this.projections.findByDiscipline(userId, 'strength'),
        this.events.findActiveOneOffs(userId, 'running', nowIso),
        this.events.findActiveOneOffs(userId, 'strength', nowIso),
      ]);

    const blockedTimeWindows = mergeWindows([
      ...(running?.blockedTimeWindows ?? []),
      ...(strength?.blockedTimeWindows ?? []),
    ]);
    const preferredTimeWindows = mergeWindows([
      ...(running?.preferredTimeWindows ?? []),
      ...(strength?.preferredTimeWindows ?? []),
    ]);
    const activeTimeOneOffs = dedupeEvents([
      ...runningOneOffs,
      ...strengthOneOffs,
    ]).filter((e) => TIME_TAG_TYPES.has(e.tag.type));

    const promptText = flattenSchedulingContext({
      blockedTimeWindows,
      preferredTimeWindows,
      activeTimeOneOffs,
    });

    return {
      userId,
      blockedTimeWindows,
      preferredTimeWindows,
      activeTimeOneOffs,
      promptText,
    };
  }
}

/** Dedupe folded time-window entries by (day|start|end), keeping highest support. */
function mergeWindows(
  entries: PrefEntry<{ day: string; start: string; end: string }>[],
): PrefEntry<{ day: string; start: string; end: string }>[] {
  const byKey = new Map<
    string,
    PrefEntry<{ day: string; start: string; end: string }>
  >();
  for (const e of entries) {
    const key = `${e.value.day}|${e.value.start}|${e.value.end}`;
    const existing = byKey.get(key);
    if (!existing || e.supportCount > existing.supportCount) {
      byKey.set(key, e);
    }
  }
  return [...byKey.values()].sort((a, b) => b.supportCount - a.supportCount);
}

/** Dedupe events by id (cross-discipline reads can overlap on null-discipline). */
function dedupeEvents(events: PreferenceEvent[]): PreferenceEvent[] {
  const seen = new Map<string, PreferenceEvent>();
  for (const e of events) {
    const key = e.id ?? `${e.eventDate}|${e.tag.type}|${e.tag.value ?? ''}`;
    if (!seen.has(key)) seen.set(key, e);
  }
  return [...seen.values()];
}
