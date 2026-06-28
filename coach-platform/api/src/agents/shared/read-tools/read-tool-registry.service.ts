import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GoogleCalendarClient } from '../../../integrations/domain/google-calendar';
import { TrainingProfileStatusResponse } from '../../../training/application/dto/training-profile.response';
import { GetTrainingProfileQuery } from '../../../training/application/queries/get-training-profile.query';
import { GetRecentPreferenceEventsQuery } from '../../../personalization/application/queries/get-recent-preference-events.query';
import { GetCalendarRangeQuery } from '../../../planned-sessions/application/queries/get-calendar-range.query';
import { GetWeekQuery } from '../../../planned-sessions/application/queries/get-week.query';
import {
  GetCurrentProfileQuery,
  GetMetricHistoryQuery,
  GetPerformanceRangeQuery,
} from '../../../performance/application/queries/performance.queries';
import { GetRecoveryRangeQuery } from '../../../recovery/application/queries/get-recovery-range.query';
import { FindSessionsQuery } from '../../../sessions/application/queries/find-sessions.query';
import { AnyAgentTool, defineTool } from '../llm/agent-tool';
import { computeAdherence, computeCrossSource } from './aggregates';
import {
  getExerciseDetail,
  searchExerciseCatalog,
} from './exercise-catalog.read';
import {
  getExerciseDetailSchema,
  getPreferenceEventsSchema,
  getWeekSchema,
  queryAdherenceSchema,
  queryCrossSourceSchema,
  queryPerformanceSchema,
  queryRecoverySchema,
  querySessionsSchema,
  searchExerciseCatalogSchema,
  dateRangeSchema,
  listCalendarEventsSchema,
  getAvailabilitySchema,
} from './read-tools.schemas';

interface ItemsEnvelope<T> {
  items: T[];
}

/**
 * The single shared read-tool registry. Defined and tested ONCE, granted by
 * reference: the assistant gets the union of every tool, specialists get scoped
 * subsets. Each tool dispatches an EXISTING CQRS query (so there is no second
 * read path / no drift) and is tenant-scoped via the AgentToolContext userId —
 * never via model-supplied arguments. All tools are non-terminal (read only).
 */
@Injectable()
export class ReadToolRegistry {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly calendar: GoogleCalendarClient,
  ) {}

  // ── individual tools ──────────────────────────────────────────────────────

  queryPlannedSessions(): AnyAgentTool {
    return defineTool({
      name: 'query_planned_sessions',
      description:
        'List planned training sessions (prescription + outcome) in a date window.',
      schema: dateRangeSchema,
      terminal: false,
      handler: (args, ctx) =>
        this.queryBus.execute(
          new GetCalendarRangeQuery(ctx.userId, args.from, args.to),
        ),
    });
  }

  getWeek(): AnyAgentTool {
    return defineTool({
      name: 'get_week',
      description:
        'Fetch all planned sessions for one program week, in scheduled order.',
      schema: getWeekSchema,
      terminal: false,
      handler: (args, ctx) =>
        this.queryBus.execute(
          new GetWeekQuery(ctx.userId, args.programId, args.weekIndex),
        ),
    });
  }

  querySessions(): AnyAgentTool {
    return defineTool({
      name: 'query_sessions',
      description:
        'List observed (executed) workout sessions with their objective numbers.',
      schema: querySessionsSchema,
      terminal: false,
      handler: async (args, ctx) => {
        const page = await this.queryBus.execute<
          FindSessionsQuery,
          ItemsEnvelope<unknown>
        >(
          new FindSessionsQuery(
            ctx.userId,
            args.from,
            args.to,
            args.type,
            null,
            args.limit,
          ),
        );
        return page.items;
      },
    });
  }

  queryPerformance(): AnyAgentTool {
    return defineTool({
      name: 'query_performance',
      description:
        'Performance data: mode=range (daily aggregates), current_profile (latest per metric), or metric_history (one metric over time).',
      schema: queryPerformanceSchema,
      terminal: false,
      handler: async (args, ctx) => {
        if (args.mode === 'current_profile') {
          return this.queryBus.execute(new GetCurrentProfileQuery(ctx.userId));
        }
        if (args.mode === 'metric_history') {
          if (!args.metric) {
            throw new Error('metric is required for mode=metric_history.');
          }
          return this.queryBus.execute(
            new GetMetricHistoryQuery(ctx.userId, args.metric),
          );
        }
        if (!args.from || !args.to) {
          throw new Error('from and to are required for mode=range.');
        }
        const page = await this.queryBus.execute<
          GetPerformanceRangeQuery,
          ItemsEnvelope<unknown>
        >(
          new GetPerformanceRangeQuery(
            ctx.userId,
            args.from,
            args.to,
            null,
            args.limit,
          ),
        );
        return page.items;
      },
    });
  }

  queryRecovery(): AnyAgentTool {
    return defineTool({
      name: 'query_recovery',
      description:
        'Daily recovery/readiness snapshots (HRV, sleep, training readiness, ACWR) in a window.',
      schema: queryRecoverySchema,
      terminal: false,
      handler: async (args, ctx) => {
        const page = await this.queryBus.execute<
          GetRecoveryRangeQuery,
          ItemsEnvelope<unknown>
        >(
          new GetRecoveryRangeQuery(
            ctx.userId,
            args.from,
            args.to,
            null,
            args.limit,
          ),
        );
        return page.items;
      },
    });
  }

  getPreferenceEvents(): AnyAgentTool {
    return defineTool({
      name: 'get_preference_events',
      description:
        'Raw, most-recent-first preference events (the append-only log) for history/provenance.',
      schema: getPreferenceEventsSchema,
      terminal: false,
      handler: (args, ctx) =>
        this.queryBus.execute(
          new GetRecentPreferenceEventsQuery(
            ctx.userId,
            args.limit,
            args.discipline ?? undefined,
          ),
        ),
    });
  }

  searchExerciseCatalog(): AnyAgentTool {
    return defineTool({
      name: 'search_exercise_catalog',
      description:
        'Search the canonical exercise catalog by text/muscle/pattern/equipment/difficulty.',
      schema: searchExerciseCatalogSchema,
      terminal: false,
      handler: (args) => Promise.resolve(searchExerciseCatalog(args)),
    });
  }

  getExerciseDetail(): AnyAgentTool {
    return defineTool({
      name: 'get_exercise_detail',
      description: 'Full catalog record for one canonical exercise id.',
      schema: getExerciseDetailSchema,
      terminal: false,
      handler: (args) => Promise.resolve(getExerciseDetail(args)),
    });
  }

  queryAdherence(): AnyAgentTool {
    return defineTool({
      name: 'query_adherence',
      description:
        'Adherence aggregate over planned sessions: completion rate, skip counts by reason, most-skipped session, skips by time of day.',
      schema: queryAdherenceSchema,
      terminal: false,
      handler: async (args, ctx) => {
        const planned = await this.queryBus.execute<GetCalendarRangeQuery, []>(
          new GetCalendarRangeQuery(ctx.userId, args.from, args.to),
        );
        return computeAdherence(planned);
      },
    });
  }

  queryCrossSource(): AnyAgentTool {
    return defineTool({
      name: 'query_cross_source',
      description:
        'Correlate planned outcomes with recovery by date (e.g. RPE vs readiness). Retrieval-side join, not a verdict.',
      schema: queryCrossSourceSchema,
      terminal: false,
      handler: async (args, ctx) => {
        const [planned, recovery] = await Promise.all([
          this.queryBus.execute<GetCalendarRangeQuery, []>(
            new GetCalendarRangeQuery(ctx.userId, args.from, args.to),
          ),
          this.queryBus.execute<
            GetRecoveryRangeQuery,
            ItemsEnvelope<never>
          >(
            new GetRecoveryRangeQuery(ctx.userId, args.from, args.to, null, 60),
          ),
        ]);
        return computeCrossSource(planned, recovery.items);
      },
    });
  }

  listCalendarEvents(): AnyAgentTool {
    return defineTool({
      name: 'list_calendar_events',
      description:
        "Read the user's real Google Calendar events (busy/free + titles) in a window, for clash detection.",
      schema: listCalendarEventsSchema,
      terminal: false,
      handler: (args, ctx) =>
        this.calendar.listEvents(ctx.userId, {
          fromUtc: `${args.from}T00:00:00.000Z`,
          toUtc: `${args.to}T23:59:59.999Z`,
        }),
    });
  }

  getAvailability(): AnyAgentTool {
    return defineTool({
      name: 'get_availability',
      description:
        'Recurring weekly availability slots (day/start/end) from the training profile.',
      schema: getAvailabilitySchema,
      terminal: false,
      handler: async (_args, ctx) => {
        const status = await this.queryBus.execute<
          GetTrainingProfileQuery,
          TrainingProfileStatusResponse
        >(new GetTrainingProfileQuery(ctx.userId));
        return status.profile?.availability ?? [];
      },
    });
  }

  // ── scoped bundles ──────────────────────────────────────────────────────

  /** Coach: program/sessions/performance/prefs/catalog. */
  forCoach(): AnyAgentTool[] {
    return [
      this.queryPlannedSessions(),
      this.getWeek(),
      this.querySessions(),
      this.queryPerformance(),
      this.getPreferenceEvents(),
      this.searchExerciseCatalog(),
      this.getExerciseDetail(),
      this.queryAdherence(),
    ];
  }

  /** Recovery: recovery/sessions/performance. */
  forRecovery(): AnyAgentTool[] {
    return [
      this.queryRecovery(),
      this.querySessions(),
      this.queryPerformance(),
    ];
  }

  /** Planner: calendar + availability + planned sessions. */
  forPlanner(): AnyAgentTool[] {
    return [
      this.queryPlannedSessions(),
      this.getWeek(),
      this.listCalendarEvents(),
      this.getAvailability(),
    ];
  }

  /** Assistant: the union of every read-tool. */
  all(): AnyAgentTool[] {
    return [
      this.queryPlannedSessions(),
      this.getWeek(),
      this.querySessions(),
      this.queryPerformance(),
      this.queryRecovery(),
      this.getPreferenceEvents(),
      this.searchExerciseCatalog(),
      this.getExerciseDetail(),
      this.queryAdherence(),
      this.queryCrossSource(),
      this.listCalendarEvents(),
      this.getAvailability(),
    ];
  }
}
