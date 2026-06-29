import { Injectable, Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { OnEvent } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import {
  CreateProgramCommand,
  CreateProgramResult,
} from '../../program/application/commands/create-program.command';
import { GetActiveProgramQuery } from '../../program/application/queries/get-active-program.query';
import { ActiveProgramResponse } from '../../program/application/dto/program.response';
import {
  TRAINING_PROFILE_CREATED,
  TrainingProfileCreatedEvent,
} from '../../training/application/events/training-profile-created.event';
import { GetTrainingProfileQuery } from '../../training/application/queries/get-training-profile.query';
import { TrainingProfileStatusResponse } from '../../training/application/dto/training-profile.response';
import { UserResponse } from '../../users/application/dto/user.response';
import { GetUserQuery } from '../../users/application/queries/get-user.query';
import { Pipeline } from '../orchestrator/pipeline.types';
import { PipelineQueue } from '../shared/queue/pipeline-queue.service';
import { TriggerContextResolver } from './trigger-context.resolver';

/**
 * First-program seam. When a training profile is saved (onboarding submit), this
 * seeds a minimal active program and fires PROGRAM_GENERATION so the user lands
 * on a freshly-built week.
 *
 * First-time only: if the user already has an active program (re-onboarding),
 * we skip — re-planning a live program goes through the explicit replan/approval
 * flow, not a silent from-scratch regeneration. The seed carries only week 0 as
 * a placeholder current week (Coach commits the real skeleton during the run);
 * it exists so context resolution + the skeleton write have a program to target.
 */
@Injectable()
export class OnboardingGenerationListener {
  private readonly logger = new Logger(OnboardingGenerationListener.name);

  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
    private readonly resolver: TriggerContextResolver,
    private readonly queue: PipelineQueue,
  ) {}

  @OnEvent(TRAINING_PROFILE_CREATED)
  async handle(event: TrainingProfileCreatedEvent): Promise<void> {
    const { userId } = event.payload;
    try {
      const existing = await this.queryBus.execute<
        GetActiveProgramQuery,
        ActiveProgramResponse
      >(new GetActiveProgramQuery(userId));
      if (existing.hasProgram) {
        this.logger.log(
          `User ${userId} already has an active program; skipping auto-generation.`,
        );
        return;
      }

      const status = await this.queryBus.execute<
        GetTrainingProfileQuery,
        TrainingProfileStatusResponse
      >(new GetTrainingProfileQuery(userId));
      const profile = status.profile;
      if (!profile) {
        this.logger.warn(
          `No active training profile for ${userId} on create; cannot seed program.`,
        );
        return;
      }

      const user = await this.queryBus.execute<GetUserQuery, UserResponse>(
        new GetUserQuery(userId),
      );
      const startDate = this.localToday(user.timezone ?? 'UTC');
      const programId = await this.seedProgram(userId, profile, startDate);

      const ctx = await this.resolver.resolve(userId);
      if (!ctx) {
        this.logger.warn(
          `Seeded program ${programId} for ${userId} but context did not resolve; skipping run.`,
        );
        return;
      }

      this.logger.log(
        `Onboarding for ${userId} → PROGRAM_GENERATION (program ${programId}).`,
      );
      await this.queue.enqueue({
        pipeline: Pipeline.PROGRAM_GENERATION,
        ctx: {
          userId,
          runId: `program-gen:onboarding:${userId}:${programId}`,
          discipline: ctx.discipline,
          timezone: ctx.timezone,
          weekWindow: ctx.weekWindow,
          weekIndex: ctx.weekIndex,
          programId: ctx.programId,
        },
      });
    } catch (err) {
      this.logger.error(
        `Auto-generation after onboarding failed for ${userId}: ${String(err)}`,
      );
    }
  }

  /** Seed a minimal active program with a single placeholder current week. */
  private async seedProgram(
    userId: string,
    profile: TrainingProfileStatusResponse['profile'],
    startDate: string,
  ): Promise<string> {
    const p = profile!;
    const { programId } = await this.commandBus.execute<
      CreateProgramCommand,
      CreateProgramResult
    >(
      new CreateProgramCommand(userId, {
        discipline: p.discipline,
        goalSnapshot: {
          primaryGoal: p.goal.primaryGoal,
          note: p.goal.note ?? undefined,
          horizon: p.goal.horizon,
        },
        startDate,
        horizonDate: p.goal.horizon,
        weeks: [
          {
            weekIndex: 0,
            startDate,
            endDate: this.addDays(startDate, 6),
            theme: 'base',
            planState: 'tentative',
            status: 'current',
          },
        ],
      }),
    );
    return programId;
  }

  /** Today's local date (YYYY-MM-DD) in the user's timezone. */
  private localToday(timezone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  /** Add whole days to a YYYY-MM-DD date, returning YYYY-MM-DD. */
  private addDays(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
}
