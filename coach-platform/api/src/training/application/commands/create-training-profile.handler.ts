import { Inject } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TransactionManager } from '../../../common/transaction/transaction.manager';
import { UpdateUserProfileCommand } from '../../../users/application/commands/update-user-profile.command';
import { TrainingProfile } from '../../domain/training-profile.model';
import {
  TRAINING_PROFILE_REPOSITORY,
  TrainingProfileRepositoryPort,
} from '../../domain/training-profile.repository.port';
import { CreateTrainingProfileDto } from '../dto/create-training-profile.dto';
import { CreateTrainingProfileCommand } from './create-training-profile.command';

/** Derives the 3-month goal horizon as a YYYY-MM-DD string from "now". */
function threeMonthHorizon(now = new Date()): string {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() + 3);
  return d.toISOString().slice(0, 10);
}

/**
 * Atomic onboarding submit. In one Mongo transaction it (1) patches the profile
 * fields that belong on `users` (sex / dob / height / weight) via the users
 * context, and (2) writes the new active training profile — archiving any prior
 * one. Either both succeed or neither does, so a user never ends up half-onboarded.
 */
@CommandHandler(CreateTrainingProfileCommand)
export class CreateTrainingProfileHandler
  implements ICommandHandler<CreateTrainingProfileCommand, { onboarded: true }>
{
  constructor(
    private readonly commandBus: CommandBus,
    private readonly txn: TransactionManager,
    @Inject(TRAINING_PROFILE_REPOSITORY)
    private readonly repository: TrainingProfileRepositoryPort,
  ) {}

  async execute(
    command: CreateTrainingProfileCommand,
  ): Promise<{ onboarded: true }> {
    const { userId, dto } = command;
    const profile = this.toDomain(userId, dto);

    await this.txn.runInTransaction(async () => {
      await this.commandBus.execute(
        new UpdateUserProfileCommand(userId, {
          sex: dto.profile.sex,
          dateOfBirth: dto.profile.dateOfBirth,
          heightCm: dto.profile.heightCm ?? null,
          weightKg: dto.profile.weightKg ?? null,
        }),
      );
      await this.repository.replaceActive(profile);
    });

    return { onboarded: true };
  }

  private toDomain(
    userId: string,
    dto: CreateTrainingProfileDto,
  ): TrainingProfile {
    return {
      userId,
      discipline: dto.discipline,
      goal: {
        primaryGoal: dto.goal.primaryGoal,
        note: dto.goal.note ?? null,
        horizon: threeMonthHorizon(),
      },
      availability: dto.availability.map((a) => ({
        day: a.day,
        startTime: a.startTime,
        endTime: a.endTime,
      })),
      sessionDurationMin: dto.sessionDurationMin,
      run: dto.run
        ? {
            weeklyKm: dto.run.weeklyKm,
            likedRunTypes: dto.run.likedRunTypes,
            experienceLevel: dto.run.experienceLevel ?? null,
            longestRecentKm: dto.run.longestRecentKm ?? null,
            targetRace: dto.run.targetRace ?? null,
            recent5kTime: dto.run.recent5kTime ?? null,
          }
        : null,
      strength: dto.strength
        ? {
            targetMuscleGroups: dto.strength.targetMuscleGroups,
            exercisesPerSession: dto.strength.exercisesPerSession,
            setsPerExercise: dto.strength.setsPerExercise,
            repsPerExercise: dto.strength.repsPerExercise,
            equipment: dto.strength.equipment,
            preferredExercises: dto.strength.preferredExercises ?? [],
            experienceLevel: dto.strength.experienceLevel ?? null,
            splitPreference: dto.strength.splitPreference ?? null,
          }
        : null,
      status: 'active',
      completedAt: null,
    };
  }
}
