import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversationModule } from './conversation/conversation.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { UsersModule } from '../users/users.module';
import { ProgramModule } from '../program/program.module';
import { PlannedSessionsModule } from '../planned-sessions/planned-sessions.module';
import { AssistantController } from './assistant/interface/assistant.controller';
import { WorkflowStreamController } from './assistant/interface/workflow-stream.controller';
import { ApprovalController } from './approval/interface/approval.controller';
import { PendingCardBatchService } from './approval/pending-card-batch.service';
import { PENDING_CARD_BATCH_REPOSITORY } from './approval/domain/pending-card-batch.repository.port';
import { PendingCardBatchRepository } from './approval/infrastructure/pending-card-batch.repository';
import {
  PendingCardBatchDoc,
  PendingCardBatchSchema,
} from './approval/infrastructure/pending-card-batch.schema';
import { AgentTelemetryService } from './shared/llm/agent-telemetry.service';
import { AgenticLoopRuntime } from './shared/llm/agentic-loop.runtime';
import { OpenAiClient } from './shared/llm/openai.client';
import { ReadToolRegistry } from './shared/read-tools/read-tool-registry.service';
import { SeedContextBuilder } from './shared/seed/seed-context.builder';
import { CoachService } from './coach/coach.service';
import { BuildConversationOrchestrator } from './build/build-conversation.orchestrator';
import { RecoveryService } from './recovery/recovery.service';
import { PlannerService } from './planner/planner.service';
import { OrchestratorSaga } from './orchestrator/orchestrator.saga';
import { IdempotencyStore } from './shared/queue/idempotency.store';
import { PipelineQueue } from './shared/queue/pipeline-queue.service';
import { AssistantService } from './assistant/assistant.service';
import { DelegationService } from './assistant/delegation';
import { PreferenceDistillationService } from './assistant/preference-distillation.service';
import { FlushConversationPreferencesHandler } from './assistant/flush-conversation-preferences.handler';
import { TriggerContextResolver } from './triggers/trigger-context.resolver';
import { FetchTrigger } from './triggers/fetch.trigger';
import { OutcomeTrigger } from './triggers/outcome.trigger';
import { OutcomeClarifyListener } from './triggers/outcome-clarify.listener';
import { SessionFlushTrigger } from './triggers/session-flush.trigger';
import { SessionFlushListener } from './triggers/session-flush.listener';
import { OnboardingGenerationListener } from './triggers/onboarding-generation.listener';
import { AgentsTriggerController } from './triggers/interface/agents-trigger.controller';
import { CalendarSyncService } from './approval/calendar-sync.service';
import { ApprovalService } from './approval/approval.service';
import { ApprovalTtlService } from './approval/approval-ttl.service';
import { ScheduledWeekBuildController } from './build/scheduled-build/interface/scheduled-week-build.controller';
import { SCHEDULED_WEEK_BUILD_REPOSITORY } from './build/scheduled-build/domain/scheduled-week-build.repository.port';
import { ScheduledWeekBuildRepository } from './build/scheduled-build/infrastructure/scheduled-week-build.repository';
import {
  ScheduledWeekBuildDoc,
  ScheduledWeekBuildSchema,
} from './build/scheduled-build/infrastructure/scheduled-week-build.schema';
import { ScheduleWeekBuildHandler } from './build/scheduled-build/application/commands/schedule-week-build.handler';
import { CancelScheduledWeekBuildHandler } from './build/scheduled-build/application/commands/cancel-scheduled-week-build.handler';
import { ListScheduledWeekBuildsHandler } from './build/scheduled-build/application/queries/list-scheduled-week-builds.handler';
import { ScheduledWeekBuildScheduler } from './build/scheduled-build/scheduled-week-build.scheduler';

/**
 * Top-level agent layer: the LLM reasoning tier that sits ON TOP of the existing
 * bounded contexts. It owns NO domain data — every write goes THROUGH the
 * existing CQRS commands of the feature modules, so domain modules keep write
 * ownership and this stays a thin reasoning tier.
 *
 * Phase 0 wires the shared infrastructure (LLM client, bounded-loop runtime,
 * telemetry, structured-output helpers). Later phases add the read-tool
 * registry, the per-specialist submodules (coach/recovery/planner/assistant),
 * and the orchestrator saga + queue.
 */
@Module({
  imports: [
    CqrsModule,
    ConversationModule,
    IntegrationsModule,
    UsersModule,
    ProgramModule,
    PlannedSessionsModule,
    MongooseModule.forFeature([
      { name: PendingCardBatchDoc.name, schema: PendingCardBatchSchema },
      { name: ScheduledWeekBuildDoc.name, schema: ScheduledWeekBuildSchema },
    ]),
  ],
  controllers: [
    AssistantController,
    WorkflowStreamController,
    ApprovalController,
    AgentsTriggerController,
    ScheduledWeekBuildController,
  ],
  providers: [
    { provide: PENDING_CARD_BATCH_REPOSITORY, useClass: PendingCardBatchRepository },
    {
      provide: SCHEDULED_WEEK_BUILD_REPOSITORY,
      useClass: ScheduledWeekBuildRepository,
    },
    ScheduleWeekBuildHandler,
    CancelScheduledWeekBuildHandler,
    ListScheduledWeekBuildsHandler,
    ScheduledWeekBuildScheduler,
    PreferenceDistillationService,
    FlushConversationPreferencesHandler,
    PendingCardBatchService,
    AgentTelemetryService,
    OpenAiClient,
    AgenticLoopRuntime,
    ReadToolRegistry,
    SeedContextBuilder,
    CoachService,
    BuildConversationOrchestrator,
    RecoveryService,
    PlannerService,
    OrchestratorSaga,
    IdempotencyStore,
    PipelineQueue,
    DelegationService,
    AssistantService,
    TriggerContextResolver,
    FetchTrigger,
    OutcomeTrigger,
    OutcomeClarifyListener,
    SessionFlushTrigger,
    SessionFlushListener,
    OnboardingGenerationListener,
    CalendarSyncService,
    ApprovalService,
    ApprovalTtlService,
  ],
  exports: [
    PendingCardBatchService,
    AgentTelemetryService,
    OpenAiClient,
    AgenticLoopRuntime,
    ReadToolRegistry,
    SeedContextBuilder,
    CoachService,
    RecoveryService,
    PlannerService,
    OrchestratorSaga,
    IdempotencyStore,
    PipelineQueue,
    DelegationService,
    AssistantService,
    TriggerContextResolver,
    FetchTrigger,
    OutcomeTrigger,
    SessionFlushTrigger,
    CalendarSyncService,
    ApprovalService,
    ApprovalTtlService,
  ],
})
export class AgentsModule {}
