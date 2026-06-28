import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';
import { PreferenceEventSource } from '../../domain/preference-event.model';
import { AddHealthConstraintCommand } from '../commands/add-health-constraint.command';
import { AppendPreferenceEventCommand } from '../commands/append-preference-event.command';
import { RebuildProjectionCommand } from '../commands/rebuild-projection.command';
import { AppendPreferenceEventDto } from '../dto/append-preference-event.dto';
import { PreferenceItemDto } from '../dto/preference-item.dto';

export interface IngestResult {
  /** Shared id when the items were a batch; null for single (assistant) writes. */
  batchId: string | null;
  /** Ids of the appended preference events, in input order. */
  eventIds: string[];
  /** Ids of any health constraints created from `injury` payloads. */
  constraintIds: string[];
}

/**
 * The single write-path entry point for every preference producer (weekly
 * revision, outcome hook, assistant tool, session flush). Funnelling through one
 * place guarantees the same post-write contract:
 *
 *   1. append each already-tagged event to the log (stamping source + batchId),
 *   2. for any `injury` payload, create the linked health constraint,
 *   3. rebuild the projection ONCE after the whole batch (batch-aware), so a
 *      single weekly submit triggers one distillation, not one per card.
 */
@Injectable()
export class PreferenceIngestionService {
  constructor(private readonly commandBus: CommandBus) {}

  async ingest(
    userId: string,
    source: PreferenceEventSource,
    items: PreferenceItemDto[],
    batched: boolean,
  ): Promise<IngestResult> {
    const batchId = batched && items.length > 0 ? randomUUID() : null;
    const eventIds: string[] = [];
    const constraintIds: string[] = [];

    for (const item of items) {
      const appendDto: AppendPreferenceEventDto = {
        eventDate: item.eventDate,
        source,
        batchId,
        discipline: item.discipline ?? null,
        scope: item.scope,
        durability: item.durability,
        expiresAt: item.expiresAt ?? null,
        target: item.target ?? null,
        tag: item.tag,
        rawText: item.rawText,
        appliedToProjection: item.appliedToProjection,
      };

      const { id } = await this.commandBus.execute<
        AppendPreferenceEventCommand,
        { id: string }
      >(new AppendPreferenceEventCommand(userId, appendDto));
      eventIds.push(id);

      if (item.injury) {
        const { id: constraintId } = await this.commandBus.execute<
          AddHealthConstraintCommand,
          { id: string; avoidExerciseIds: string[] }
        >(
          new AddHealthConstraintCommand(userId, {
            type: 'injury',
            label: item.injury.label ?? item.rawText ?? item.tag.type,
            affectedMuscles: item.injury.affectedMuscles,
            affectedMovementPatterns: item.injury.affectedMovementPatterns,
            explicitExerciseIds: item.injury.explicitExerciseIds,
            severity: item.injury.severity,
            sourceEventIds: [id],
          }),
        );
        constraintIds.push(constraintId);
      }
    }

    // One distillation pass covers the whole batch (and both disciplines).
    if (eventIds.length > 0) {
      await this.commandBus.execute(new RebuildProjectionCommand(userId));
    }

    return { batchId, eventIds, constraintIds };
  }
}
