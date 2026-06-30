import { Injectable, Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { OnEvent } from '@nestjs/event-emitter';
import {
  CreateProgramCommand,
  CreateProgramResult,
} from '../../program/application/commands/create-program.command';
import { GetActiveProgramQuery } from '../../program/application/queries/get-active-program.query';
import {
  ActiveProgramResponse,
  ProgramResponse,
} from '../../program/application/dto/program.response';
import {
  TRAINING_PROFILE_CREATED,
  TrainingProfileCreatedEvent,
} from '../../training/application/events/training-profile-created.event';
import { GetTrainingProfileQuery } from '../../training/application/queries/get-training-profile.query';
import { TrainingProfileStatusResponse } from '../../training/application/dto/training-profile.response';
import { UserResponse } from '../../users/application/dto/user.response';
import { GetUserQuery } from '../../users/application/queries/get-user.query';
import {
  StartConversationCommand,
  StartConversationResult,
} from '../conversation/application/commands/start-conversation.command';
import { BuildConversationOrchestrator } from '../build/build-conversation.orchestrator';
import { TriggerContextResolver } from './trigger-context.resolver';

/** Title for the auto-opened build chat (shown in the conversation list). */
const BUILD_CONVERSATION_TITLE = 'Build your first week';

/**
 * First-program seam. When a training profile is saved (onboarding submit), this
 * seeds a minimal active program and opens a conversational `program_build` chat
 * so the coach can walk the user through their first week (propose targets → lock
 * → draft sessions → schedule), instead of silently autogenerating a whole week.
 *
 * First-time only: if the user already has a *built* program (re-onboarding),
 * we skip — re-planning a live program goes through the explicit replan/approval
 * flow, not a silent from-scratch regeneration. The seed carries only week 0 as
 * a placeholder current week (Coach commits the real skeleton during the build);
 * it exists so context resolution + the skeleton write have a program to target.
 *
 * Self-healing: the seed is committed BEFORE the build runs, so an interrupted
 * first run (abort, process restart, dropped tab) leaves a bare, un-built program
 * behind. A built program is distinguished from a bare seed by whether its current
 * week has been generated (`generatedAt`). When an un-built program is found we
 * resume the build against it rather than skipping — otherwise the user is stuck
 * forever on a placeholder the auto-trigger refuses to (re)build.
 */
@Injectable()
export class OnboardingGenerationListener {
  private readonly logger = new Logger(OnboardingGenerationListener.name);

  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
    private readonly resolver: TriggerContextResolver,
    private readonly orchestrator: BuildConversationOrchestrator,
  ) {}

  @OnEvent(TRAINING_PROFILE_CREATED)
  async handle(event: TrainingProfileCreatedEvent): Promise<void> {
    const { userId } = event.payload;
    try {
      const existing = await this.queryBus.execute<
        GetActiveProgramQuery,
        ActiveProgramResponse
      >(new GetActiveProgramQuery(userId));

      // A built program means a genuine re-onboarding — never silently rebuild a
      // live program; that path is the explicit replan/approval flow.
      if (existing.hasProgram && this.isBuilt(existing.program)) {
        this.logger.log(
          `User ${userId} already has a built program; skipping auto-generation.`,
        );
        return;
      }

      // Either no program yet (first onboarding) or a bare seed left behind by an
      // interrupted run. Reuse the seed if present; otherwise seed a fresh one.
      let programId: string;
      if (existing.hasProgram && existing.program) {
        programId = existing.program.id;
        this.logger.log(
          `User ${userId} has an un-built program ${programId}; resuming generation.`,
        );
      } else {
        const seeded = await this.seedFromProfile(userId);
        if (!seeded) {
          return; // reason already logged
        }
        programId = seeded;
      }

      const ctx = await this.resolver.resolve(userId);
      if (!ctx) {
        this.logger.warn(
          `Program ${programId} for ${userId} but context did not resolve; skipping run.`,
        );
        return;
      }

      // Open the build conversation FIRST (so a stable id exists), then kick off
      // the build: the orchestrator surfaces the chat over SSE and posts the
      // coach's first targets proposal. System-originated + plan mode + attention
      // so the UI pins it and lands the user there.
      const { conversationId } = await this.commandBus.execute<
        StartConversationCommand,
        StartConversationResult
      >(
        new StartConversationCommand(userId, BUILD_CONVERSATION_TITLE, {
          mode: 'plan',
          origin: 'system',
          attention: true,
          purpose: 'program_build',
          buildContext: { programId, weekIndex: ctx.weekIndex },
        }),
      );

      this.logger.log(
        `Onboarding for ${userId} → program_build conversation ${conversationId} (program ${programId}).`,
      );
      await this.orchestrator.startBuild({
        userId,
        conversationId,
        title: BUILD_CONVERSATION_TITLE,
        programId,
        discipline: ctx.discipline,
        weekIndex: ctx.weekIndex,
      });
    } catch (err) {
      this.logger.error(
        `Auto-generation after onboarding failed for ${userId}: ${String(err)}`,
      );
    }
  }

  /**
   * A program is "built" once its current week has been generated. The seed
   * leaves `generatedAt: null`; Coach stamps it when it commits the skeleton, so
   * this reliably tells a finished program from an abandoned placeholder.
   */
  private isBuilt(program: ProgramResponse | null): boolean {
    if (!program) {
      return false;
    }
    const current = program.weeks.find(
      (w) => w.weekIndex === program.currentWeekIndex,
    );
    return current?.generatedAt != null;
  }

  /**
   * Resolve the onboarding profile + user and seed a minimal active program.
   * Returns the new program's id, or null (with a logged reason) when there's no
   * profile to seed from.
   */
  private async seedFromProfile(userId: string): Promise<string | null> {
    const status = await this.queryBus.execute<
      GetTrainingProfileQuery,
      TrainingProfileStatusResponse
    >(new GetTrainingProfileQuery(userId));
    const profile = status.profile;
    if (!profile) {
      this.logger.warn(
        `No active training profile for ${userId} on create; cannot seed program.`,
      );
      return null;
    }

    const user = await this.queryBus.execute<GetUserQuery, UserResponse>(
      new GetUserQuery(userId),
    );
    const startDate = this.localToday(user.timezone ?? 'UTC');
    return this.seedProgram(userId, profile, startDate);
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
