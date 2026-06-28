import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { AddHealthConstraintCommand } from '../application/commands/add-health-constraint.command';
import { CaptureAssistantPreferenceCommand } from '../application/commands/capture-assistant-preference.command';
import { FlushSessionPreferencesCommand } from '../application/commands/flush-session-preferences.command';
import { RebuildProjectionCommand } from '../application/commands/rebuild-projection.command';
import { SeedPersonalizationCommand } from '../application/commands/seed-personalization.command';
import { SubmitWeeklyRevisionsCommand } from '../application/commands/submit-weekly-revisions.command';
import { AddHealthConstraintDto } from '../application/dto/add-health-constraint.dto';
import { FlushSessionPreferencesDto } from '../application/dto/flush-session-preferences.dto';
import { PreferenceItemDto } from '../application/dto/preference-item.dto';
import { SubmitWeeklyRevisionsDto } from '../application/dto/submit-weekly-revisions.dto';
import { GetGenerationContextQuery } from '../application/queries/get-generation-context.query';
import { GetRecoveryContextQuery } from '../application/queries/get-recovery-context.query';
import { GetSchedulingContextQuery } from '../application/queries/get-scheduling-context.query';
import { GetUserPreferencesQuery } from '../application/queries/get-user-preferences.query';
import { IngestResult } from '../application/services/preference-ingestion.service';
import {
  GenerationContext,
  RecoveryContext,
  SchedulingContext,
} from '../domain/generation-context.model';
import { EventDiscipline } from '../domain/preference-event.model';
import { UserPreferences } from '../domain/user-preferences.model';
import { DisciplineQueryDto } from './dto/discipline-query.dto';
import { RebuildQueryDto } from './dto/rebuild-query.dto';

/**
 * The personalization HTTP surface. Identity always comes from the authenticated
 * principal (never the body), keeping every read/write tenant-scoped. Writes flow
 * through the ingestion funnel (which rebuilds the projection); reads serve the
 * distilled projection and the per-agent context slices.
 */
@Controller('personalization')
export class PersonalizationController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /* ── writes ──────────────────────────────────────────────────── */

  /** POST /personalization/revisions — weekly NotebookLM-style batch submit. */
  @Post('revisions')
  async submitRevisions(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitWeeklyRevisionsDto,
  ): Promise<IngestResult> {
    return this.commandBus.execute<SubmitWeeklyRevisionsCommand, IngestResult>(
      new SubmitWeeklyRevisionsCommand(user.userId, dto),
    );
  }

  /** POST /personalization/preferences — assistant `save_preference` (single). */
  @Post('preferences')
  async capturePreference(
    @CurrentUser() user: AuthenticatedUser,
    @Body() item: PreferenceItemDto,
  ): Promise<IngestResult> {
    return this.commandBus.execute<
      CaptureAssistantPreferenceCommand,
      IngestResult
    >(new CaptureAssistantPreferenceCommand(user.userId, item));
  }

  /** POST /personalization/session-flush — session-teardown deferred batch. */
  @Post('session-flush')
  async flushSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: FlushSessionPreferencesDto,
  ): Promise<IngestResult> {
    return this.commandBus.execute<FlushSessionPreferencesCommand, IngestResult>(
      new FlushSessionPreferencesCommand(user.userId, dto),
    );
  }

  /** POST /personalization/health-constraints — record an injury / limitation. */
  @Post('health-constraints')
  async addHealthConstraint(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddHealthConstraintDto,
  ): Promise<{ id: string; avoidExerciseIds: string[] }> {
    return this.commandBus.execute<
      AddHealthConstraintCommand,
      { id: string; avoidExerciseIds: string[] }
    >(new AddHealthConstraintCommand(user.userId, dto));
  }

  /** POST /personalization/rebuild?discipline= — force a projection replay. */
  @Post('rebuild')
  async rebuild(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RebuildQueryDto,
  ): Promise<{ rebuilt: EventDiscipline[] }> {
    return this.commandBus.execute<
      RebuildProjectionCommand,
      { rebuilt: EventDiscipline[] }
    >(new RebuildProjectionCommand(user.userId, query.discipline));
  }

  /** POST /personalization/seed — load demo signals for the current user (dev). */
  @Post('seed')
  async seed(@CurrentUser() user: AuthenticatedUser): Promise<IngestResult> {
    return this.commandBus.execute<SeedPersonalizationCommand, IngestResult>(
      new SeedPersonalizationCommand(user.userId),
    );
  }

  /* ── reads ───────────────────────────────────────────────────── */

  /** GET /personalization/preferences?discipline= — the distilled projection. */
  @Get('preferences')
  async getPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DisciplineQueryDto,
  ): Promise<UserPreferences | null> {
    return this.queryBus.execute<
      GetUserPreferencesQuery,
      UserPreferences | null
    >(new GetUserPreferencesQuery(user.userId, query.discipline));
  }

  /** GET /personalization/context/generation?discipline= — Coach slice. */
  @Get('context/generation')
  async generationContext(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DisciplineQueryDto,
  ): Promise<GenerationContext> {
    return this.queryBus.execute<GetGenerationContextQuery, GenerationContext>(
      new GetGenerationContextQuery(user.userId, query.discipline),
    );
  }

  /** GET /personalization/context/recovery — Recovery Guru slice. */
  @Get('context/recovery')
  async recoveryContext(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RecoveryContext> {
    return this.queryBus.execute<GetRecoveryContextQuery, RecoveryContext>(
      new GetRecoveryContextQuery(user.userId),
    );
  }

  /** GET /personalization/context/scheduling — Planner slice. */
  @Get('context/scheduling')
  async schedulingContext(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SchedulingContext> {
    return this.queryBus.execute<GetSchedulingContextQuery, SchedulingContext>(
      new GetSchedulingContextQuery(user.userId),
    );
  }
}
