import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ExerciseResolverService } from '../../../exercises/application/exercise-resolver.service';
import {
  CURRENT_TAXONOMY_VERSION,
  PreferenceEvent,
  PreferenceTarget,
} from '../../domain/preference-event.model';
import {
  PREFERENCE_EVENT_REPOSITORY,
  PreferenceEventRepositoryPort,
} from '../../domain/preference-event.repository.port';
import { AppendPreferenceEventCommand } from './append-preference-event.command';
import { AppendPreferenceEventDto } from '../dto/append-preference-event.dto';

/** Tag types whose value/target names a catalog exercise to canonicalise. */
const EXERCISE_TAGS = new Set(['disliked_exercise', 'exercise_override']);

@CommandHandler(AppendPreferenceEventCommand)
export class AppendPreferenceEventHandler
  implements ICommandHandler<AppendPreferenceEventCommand, { id: string }>
{
  constructor(
    @Inject(PREFERENCE_EVENT_REPOSITORY)
    private readonly repository: PreferenceEventRepositoryPort,
    private readonly exercises: ExerciseResolverService,
  ) {}

  async execute(
    command: AppendPreferenceEventCommand,
  ): Promise<{ id: string }> {
    const { userId, dto } = command;

    // one_off and narrative-only ('other') events never touch the projection,
    // regardless of what the producer requested.
    const projectionEligible =
      dto.durability === 'standing' && dto.tag.type !== 'other';
    const appliedToProjection =
      projectionEligible && (dto.appliedToProjection ?? false);

    const event: PreferenceEvent = {
      id: null,
      userId,
      eventDate: dto.eventDate,
      source: dto.source,
      batchId: dto.batchId ?? null,
      discipline: dto.discipline ?? null,
      scope: dto.scope,
      durability: dto.durability,
      expiresAt: dto.expiresAt ?? null,
      target: this.resolveTarget(dto),
      tag: {
        type: dto.tag.type,
        value: dto.tag.value ?? null,
        polarity: dto.tag.polarity,
        confidence: dto.tag.confidence,
      },
      rawText: dto.rawText ?? '',
      rationale: dto.rationale ?? null,
      appliedToProjection,
      consumedAt: null,
      taxonomyVersion: CURRENT_TAXONOMY_VERSION,
    };

    const id = await this.repository.append(event);
    return { id };
  }

  /**
   * Canonicalise at write time (schema-on-write): for exercise-typed tags, stamp
   * `target.exerciseId` with the catalog id resolved from the supplied id or the
   * free-text `tag.value`. An unresolved mention is NOT dropped — the event is
   * still appended with its raw text so a later catalog/taxonomy bump can
   * re-resolve it on replay.
   */
  private resolveTarget(dto: AppendPreferenceEventDto): PreferenceTarget | null {
    const base: PreferenceTarget | null = dto.target
      ? {
          plannedSessionId: dto.target.plannedSessionId ?? null,
          exerciseId: dto.target.exerciseId ?? null,
          runType: dto.target.runType ?? null,
        }
      : null;

    if (!EXERCISE_TAGS.has(dto.tag.type)) {
      return base;
    }

    // Keep an already-valid catalog id untouched.
    if (base?.exerciseId && this.exercises.isValidId(base.exerciseId)) {
      return base;
    }

    const resolved =
      typeof dto.tag.value === 'string'
        ? this.exercises.resolveId(dto.tag.value)
        : null;
    if (!resolved) {
      return base; // leave it raw for replay-time re-resolution
    }

    return {
      plannedSessionId: base?.plannedSessionId ?? null,
      exerciseId: resolved,
      runType: base?.runType ?? null,
    };
  }
}
