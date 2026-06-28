import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { IntegrationsModule } from '../integrations/integrations.module';
import { UsersModule } from '../users/users.module';
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
import { RevisionTrigger } from './triggers/revision.trigger';
import { SessionFlushTrigger } from './triggers/session-flush.trigger';
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
  imports: [CqrsModule, IntegrationsModule, UsersModule],
  providers: [
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
  exports: [
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
