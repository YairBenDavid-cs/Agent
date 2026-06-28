import { Inject, Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TransactionManager } from '../../../common/transaction/transaction.manager';
import { PreferenceIngestionService } from '../../../personalization/application/services/preference-ingestion.service';
import { UpdateUserProfileCommand } from '../../../users/application/commands/update-user-profile.command';
import { TrainingProfile } from '../../domain/training-profile.model';
import {
  TRAINING_PROFILE_REPOSITORY,
  TrainingProfileRepositoryPort,
} from '../../domain/training-profile.repository.port';
import { CreateTrainingProfileDto } from '../dto/create-training-profile.dto';
import { profileToPreferenceItems } from '../services/profile-to-preference-items';
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
  private readonly logger = new Logger(CreateTrainingProfileHandler.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly txn: TransactionManager,
    @Inject(TRAINING_PROFILE_REPOSITORY)
    private readonly repository: TrainingProfileRepositoryPort,
    private readonly ingestion: PreferenceIngestionService,
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
          country: dto.profile.country,
          timezone: dto.profile.timezone,
          heightCm: dto.profile.heightCm ?? null,
          weightKg: dto.profile.weightKg ?? null,
        }),
      );
      await this.repository.replaceActive(profile);
    });

    // Project the onboarding baseline into the semantic log so the personalization
    // projection is built by pure replay (Approach A). Done AFTER the profile
    // transaction commits: the projection is fully rebuildable/derived, so it is
    // not coupled to the profile write's atomicity — a failure here can always be
    // recovered by a later rebuild and must not roll back a saved profile.
    try {
      const eventDate = new Date().toISOString().slice(0, 10);
      const items = profileToPreferenceItems(profile, eventDate);
      await this.ingestion.ingest(userId, 'revision', items, true);
    } catch (err) {
      this.logger.error(
        `Onboarding saved but baseline preference emission failed for ${userId}; ` +
          'projection can be regenerated via rebuild.',
        err instanceof Error ? err.stack : String(err),
      );
    }

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
            trainingModalities: dto.strength.trainingModalities ?? [],
            experienceLevel: dto.strength.experienceLevel ?? null,
            splitPreference: dto.strength.splitPreference ?? null,
          }
        : null,
      status: 'active',
      completedAt: null,
    };
  }
}
