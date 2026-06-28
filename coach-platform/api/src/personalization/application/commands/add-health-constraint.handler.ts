import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HealthConstraint } from '../../domain/health-constraint.model';
import {
  HEALTH_CONSTRAINT_REPOSITORY,
  HealthConstraintRepositoryPort,
} from '../../domain/health-constraint.repository.port';
import { InjuryExpansionService } from '../services/injury-expansion.service';
import { AddHealthConstraintCommand } from './add-health-constraint.command';

@CommandHandler(AddHealthConstraintCommand)
export class AddHealthConstraintHandler
  implements
    ICommandHandler<
      AddHealthConstraintCommand,
      { id: string; avoidExerciseIds: string[] }
    >
{
  constructor(
    @Inject(HEALTH_CONSTRAINT_REPOSITORY)
    private readonly repository: HealthConstraintRepositoryPort,
    private readonly injuryExpansion: InjuryExpansionService,
  ) {}

  async execute(
    command: AddHealthConstraintCommand,
  ): Promise<{ id: string; avoidExerciseIds: string[] }> {
    const { userId, dto } = command;

    const affectedMuscles = dto.affectedMuscles ?? [];
    const affectedMovementPatterns = dto.affectedMovementPatterns ?? [];

    const avoidExerciseIds = this.injuryExpansion.expand({
      affectedMuscles,
      affectedMovementPatterns,
      explicitExerciseIds: dto.explicitExerciseIds,
    });

    const constraint: HealthConstraint = {
      id: null,
      userId,
      type: dto.type,
      label: dto.label,
      affectedMuscles,
      affectedMovementPatterns,
      avoidExerciseIds,
      severity: dto.severity,
      status: 'active',
      sourceEventIds: dto.sourceEventIds ?? [],
      notedAt: new Date().toISOString(),
      resolvedAt: null,
    };

    const id = await this.repository.add(constraint);
    return { id, avoidExerciseIds };
  }
}
