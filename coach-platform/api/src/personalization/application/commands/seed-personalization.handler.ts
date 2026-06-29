import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PreferenceItemDto } from '../dto/preference-item.dto';
import {
  IngestResult,
  PreferenceIngestionService,
} from '../services/preference-ingestion.service';
import { SeedPersonalizationCommand } from './seed-personalization.command';

/** A curated demo signal set that exercises every projection slice + a constraint. */
function demoItems(): PreferenceItemDto[] {
  const burpeeDislike = (eventDate: string): PreferenceItemDto => ({
    eventDate,
    discipline: 'strength',
    scope: 'exercise',
    durability: 'standing',
    target: { exerciseId: null, plannedSessionId: null, runType: null },
    tag: {
      type: 'disliked_exercise',
      value: 'burpees',
      polarity: 'avoid',
      confidence: 'inferred',
    },
    rawText: 'skipped the burpees again',
  });

  return [
    // Three inferred dislikes → crosses inferredDislikeSupport (3) → soft avoid.
    burpeeDislike('2026-05-12'),
    burpeeDislike('2026-05-26'),
    burpeeDislike('2026-06-09'),
    // Explicit, cross-cutting blocked window → hard.
    {
      eventDate: '2026-06-01',
      discipline: null,
      scope: 'global',
      durability: 'standing',
      tag: {
        type: 'time_window_blocked',
        value: 'mon 06:00-09:00',
        polarity: 'avoid',
        confidence: 'explicit',
      },
      rawText: 'no Monday morning workouts',
    },
    // Explicit volume bias (down).
    {
      eventDate: '2026-06-05',
      discipline: 'strength',
      scope: 'global',
      durability: 'standing',
      tag: {
        type: 'volume_bias',
        value: -0.2,
        polarity: 'decrease',
        confidence: 'explicit',
      },
      rawText: 'cut my strength volume a bit',
    },
    // Explicit modality lean.
    {
      eventDate: '2026-06-12',
      discipline: 'strength',
      scope: 'global',
      durability: 'standing',
      tag: {
        type: 'modality_pref',
        value: 'crossfit',
        polarity: 'prefer',
        confidence: 'explicit',
      },
      rawText: 'I prefer crossfit-style sessions',
    },
    // Injury → cross-cutting health constraint (N=1, never decays).
    {
      eventDate: '2026-06-15',
      discipline: null,
      scope: 'global',
      durability: 'standing',
      tag: {
        type: 'injury',
        value: 'left knee',
        polarity: 'avoid',
        confidence: 'explicit',
      },
      rawText: 'tweaked my left knee, careful with squats and lunges',
      injury: {
        label: 'left knee — patellar irritation',
        affectedMuscles: ['legs'],
        affectedMovementPatterns: ['squat', 'lunge'],
        severity: 'avoid',
      },
    },
  ];
}

@CommandHandler(SeedPersonalizationCommand)
export class SeedPersonalizationHandler
  implements ICommandHandler<SeedPersonalizationCommand, IngestResult>
{
  constructor(private readonly ingestion: PreferenceIngestionService) {}

  async execute(command: SeedPersonalizationCommand): Promise<IngestResult> {
    return this.ingestion.ingest(
      command.userId,
      'chat',
      demoItems(),
      true, // one batch, one rebuild
    );
  }
}
