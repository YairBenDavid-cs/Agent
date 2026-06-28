import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversationModule } from './conversation/conversation.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { UsersModule } from '../users/users.module';
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
import { RecoveryService } from './recovery/recovery.service';
import { PlannerService } from './planner/planner.service';
import { OrchestratorSaga } from './orchestrator/orchestrator.saga';
import { IdempotencyStore } from './shared/queue/idempotency.store';
import { PipelineQueue } from './shared/queue/pipeline-queue.service';
import { AssistantService } from './assistant/assistant.service';
import { DelegationService } from './assistant/delegation';
import { TriggerContextResolver } from './triggers/trigger-context.resolver';
import { FetchTrigger } from './triggers/fetch.trigger';
import { OutcomeTrigger } from './triggers/outcome.trigger';
import { OutcomeClarifyListener } from './triggers/outcome-clarify.listener';
import { RevisionTrigger } from './triggers/revision.trigger';
import { SessionFlushTrigger } from './triggers/session-flush.trigger';
import { SessionFlushListener } from './triggers/session-flush.listener';
import { AgentsTriggerController } from './triggers/interface/agents-trigger.controller';
import { CalendarSyncService } from './approval/calendar-sync.service';
import { ApprovalService } from './approval/approval.service';
import { ApprovalTtlService } from './approval/approval-ttl.service';

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
    MongooseModule.forFeature([
      { name: PendingCardBatchDoc.name, schema: PendingCardBatchSchema },
    ]),
  ],
  controllers: [
    AssistantController,
    WorkflowStreamController,
    ApprovalController,
    AgentsTriggerController,
  ],
  providers: [
    { provide: PENDING_CARD_BATCH_REPOSITORY, useClass: PendingCardBatchRepository },
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
    OutcomeClarifyListener,
    RevisionTrigger,
    SessionFlushTrigger,
    SessionFlushListener,
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
    RevisionTrigger,
    SessionFlushTrigger,
    CalendarSyncService,
    ApprovalService,
    ApprovalTtlService,
  ],
})
export class AgentsModule {}
