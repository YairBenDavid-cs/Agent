import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EventDiscipline } from '../../domain/preference-event.model';
import {
  PREFERENCE_EVENT_REPOSITORY,
  PreferenceEventRepositoryPort,
} from '../../domain/preference-event.repository.port';
import {
  USER_PREFERENCES_REPOSITORY,
  UserPreferencesRepositoryPort,
} from '../../domain/user-preferences.repository.port';
import { DistillationService } from '../services/distillation.service';
import { ProjectionValidatorService } from '../services/projection-validator.service';
import { RebuildProjectionCommand } from './rebuild-projection.command';

const ALL_DISCIPLINES: EventDiscipline[] = ['running', 'strength'];

@CommandHandler(RebuildProjectionCommand)
export class RebuildProjectionHandler
  implements
    ICommandHandler<RebuildProjectionCommand, { rebuilt: EventDiscipline[] }>
{
  constructor(
    @Inject(PREFERENCE_EVENT_REPOSITORY)
    private readonly events: PreferenceEventRepositoryPort,
    @Inject(USER_PREFERENCES_REPOSITORY)
    private readonly projections: UserPreferencesRepositoryPort,
    private readonly distillation: DistillationService,
    private readonly validator: ProjectionValidatorService,
  ) {}

  async execute(
    command: RebuildProjectionCommand,
  ): Promise<{ rebuilt: EventDiscipline[] }> {
    const { userId, discipline } = command;
    const disciplines = discipline ? [discipline] : ALL_DISCIPLINES;

    // One replay feeds every discipline (cross-cutting events fold into both).
    const log = await this.events.findAllForReplay(userId);
    const now = new Date();

    for (const d of disciplines) {
      const distilled = this.distillation.distill(log, d, now);
      distilled.userId = userId; // ensure set even when the log is empty
      // Enforcement gate: repair any invariant breach before it reaches the
      // store a future agent reads as gospel.
      const projection = this.validator.enforce(distilled);
      await this.projections.upsert(projection);
    }

    return { rebuilt: disciplines };
  }
}
