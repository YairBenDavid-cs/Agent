import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MongooseModule } from '@nestjs/mongoose';
import { ExercisesModule } from '../exercises/exercises.module';
import { AddHealthConstraintHandler } from './application/commands/add-health-constraint.handler';
import { AppendPreferenceEventHandler } from './application/commands/append-preference-event.handler';
import { CaptureAssistantPreferenceHandler } from './application/commands/capture-assistant-preference.handler';
import { CaptureChatPreferencesHandler } from './application/commands/capture-chat-preferences.handler';
import { FlushSessionPreferencesHandler } from './application/commands/flush-session-preferences.handler';
import { RebuildProjectionHandler } from './application/commands/rebuild-projection.handler';
import { SeedPersonalizationHandler } from './application/commands/seed-personalization.handler';
import { OutcomeToPreferenceListener } from './application/listeners/outcome-to-preference.listener';
import { GetGenerationContextHandler } from './application/queries/get-generation-context.handler';
import { GetRecentPreferenceEventsHandler } from './application/queries/get-recent-preference-events.handler';
import { GetRecoveryContextHandler } from './application/queries/get-recovery-context.handler';
import { GetSchedulingContextHandler } from './application/queries/get-scheduling-context.handler';
import { GetUserPreferencesHandler } from './application/queries/get-user-preferences.handler';
import { ContextBuilderService } from './application/services/context-builder.service';
import { DistillationService } from './application/services/distillation.service';
import { InjuryExpansionService } from './application/services/injury-expansion.service';
import { PreferenceIngestionService } from './application/services/preference-ingestion.service';
import { ProjectionValidatorService } from './application/services/projection-validator.service';
import { PromotionService } from './application/services/promotion.service';
import { HEALTH_CONSTRAINT_REPOSITORY } from './domain/health-constraint.repository.port';
import { PREFERENCE_EVENT_REPOSITORY } from './domain/preference-event.repository.port';
import { USER_PREFERENCES_REPOSITORY } from './domain/user-preferences.repository.port';
import { HealthConstraintRepository } from './infrastructure/health-constraint.repository';
import {
  HealthConstraintDoc,
  HealthConstraintSchema,
} from './infrastructure/health-constraint.schema';
import { PreferenceEventRepository } from './infrastructure/preference-event.repository';
import {
  PreferenceEventDoc,
  PreferenceEventSchema,
} from './infrastructure/preference-event.schema';
import { UserPreferencesRepository } from './infrastructure/user-preferences.repository';
import {
  UserPreferencesDoc,
  UserPreferencesSchema,
} from './infrastructure/user-preferences.schema';
import { PersonalizationController } from './interface/personalization.controller';

/**
 * The self-learning memory layer.
 *   Phase 1 — append-only semantic log (`preference_events`).
 *   Phase 2 — `user_preferences` projection + distillation/promotion engine.
 *   Phase 3 — `health_constraints` + injury → catalog-id expansion.
 *   Phase 4 — write path: weekly-revision batch, outcome hook, save_preference,
 *             session flush (all funnelled through PreferenceIngestionService).
 *   Phase 5 — read path: per-agent context slices (Coach / Recovery / Planner)
 *             assembled by ContextBuilderService and rendered to prompt text.
 *   Phase 6 — write-time canonicalisation + the ProjectionValidator enforcement
 *             gate that repairs invariant breaches before persistence.
 *   Phase 7 — the HTTP surface (PersonalizationController) + demo seed.
 */
const CommandHandlers = [
  AppendPreferenceEventHandler,
  RebuildProjectionHandler,
  AddHealthConstraintHandler,
  CaptureAssistantPreferenceHandler,
  CaptureChatPreferencesHandler,
  FlushSessionPreferencesHandler,
  SeedPersonalizationHandler,
];
const QueryHandlers = [
  GetUserPreferencesHandler,
  GetGenerationContextHandler,
  GetRecoveryContextHandler,
  GetSchedulingContextHandler,
  GetRecentPreferenceEventsHandler,
];
const DomainServices = [
  PromotionService,
  DistillationService,
  ProjectionValidatorService,
  InjuryExpansionService,
  PreferenceIngestionService,
  ContextBuilderService,
];
const Listeners = [OutcomeToPreferenceListener];

@Module({
  imports: [
    CqrsModule,
    ExercisesModule,
    MongooseModule.forFeature([
      { name: PreferenceEventDoc.name, schema: PreferenceEventSchema },
      { name: UserPreferencesDoc.name, schema: UserPreferencesSchema },
      { name: HealthConstraintDoc.name, schema: HealthConstraintSchema },
    ]),
  ],
  controllers: [PersonalizationController],
  providers: [
    {
      provide: PREFERENCE_EVENT_REPOSITORY,
      useClass: PreferenceEventRepository,
    },
    {
      provide: USER_PREFERENCES_REPOSITORY,
      useClass: UserPreferencesRepository,
    },
    {
      provide: HEALTH_CONSTRAINT_REPOSITORY,
      useClass: HealthConstraintRepository,
    },
    ...DomainServices,
    ...CommandHandlers,
    ...QueryHandlers,
    ...Listeners,
  ],
  exports: [
    PREFERENCE_EVENT_REPOSITORY,
    USER_PREFERENCES_REPOSITORY,
    HEALTH_CONSTRAINT_REPOSITORY,
    ContextBuilderService,
    // The training onboarding submit projects its baseline into the log through
    // this single write path (Approach A).
    PreferenceIngestionService,
  ],
})
export class PersonalizationModule {}
