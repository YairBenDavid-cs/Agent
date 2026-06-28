import { z } from 'zod';

/**
 * Argument schemas for the shared read-tool registry. NOTE: none of these carry
 * a `userId` — tenant scoping comes from the AgentToolContext, never from the
 * model, so an agent cannot read another user's data by hallucinating an id.
 */

const isoDate = z
  .string()
  .describe('Calendar date or ISO timestamp, e.g. "2026-06-28".');

export const dateRangeSchema = z.object({
  from: isoDate.describe('Inclusive start of the window.'),
  to: isoDate.describe('Inclusive end of the window.'),
});
export type DateRangeArgs = z.infer<typeof dateRangeSchema>;

export const querySessionsSchema = z.object({
  from: isoDate,
  to: isoDate,
  type: z
    .enum(['running', 'strength'])
    .nullable()
    .default(null)
    .describe('Filter by session type, or null for all.'),
  limit: z.number().int().min(1).max(200).default(50),
});
export type QuerySessionsArgs = z.infer<typeof querySessionsSchema>;

export const queryPerformanceSchema = z.object({
  mode: z
    .enum(['range', 'current_profile', 'metric_history'])
    .describe(
      'range = daily aggregates in a window; current_profile = latest value per metric; metric_history = full change-log for one metric.',
    ),
  from: isoDate.optional(),
  to: isoDate.optional(),
  metric: z
    .string()
    .optional()
    .describe('Required for metric_history, e.g. "vo2max" or "1rm.SQUAT".'),
  limit: z.number().int().min(1).max(200).default(60),
});
export type QueryPerformanceArgs = z.infer<typeof queryPerformanceSchema>;

export const queryRecoverySchema = z.object({
  from: isoDate,
  to: isoDate,
  limit: z.number().int().min(1).max(60).default(30),
});
export type QueryRecoveryArgs = z.infer<typeof queryRecoverySchema>;

export const getPreferenceEventsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  discipline: z.enum(['running', 'strength']).nullable().default(null),
});
export type GetPreferenceEventsArgs = z.infer<typeof getPreferenceEventsSchema>;

export const getWeekSchema = z.object({
  programId: z.string(),
  weekIndex: z.number().int().min(0),
});
export type GetWeekArgs = z.infer<typeof getWeekSchema>;

export const searchExerciseCatalogSchema = z.object({
  text: z
    .string()
    .optional()
    .describe('Free-text name/alias fragment to match.'),
  muscle: z.string().optional().describe('Filter by primary muscle group.'),
  movementPattern: z.string().optional(),
  equipment: z.string().optional().describe('Filter to a single equipment id.'),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type SearchExerciseCatalogArgs = z.infer<
  typeof searchExerciseCatalogSchema
>;

export const getExerciseDetailSchema = z.object({
  exerciseId: z.string().describe('Canonical catalog id.'),
});
export type GetExerciseDetailArgs = z.infer<typeof getExerciseDetailSchema>;

export const queryAdherenceSchema = z.object({
  from: isoDate,
  to: isoDate,
});
export type QueryAdherenceArgs = z.infer<typeof queryAdherenceSchema>;

export const queryCrossSourceSchema = z.object({
  from: isoDate,
  to: isoDate,
});
export type QueryCrossSourceArgs = z.infer<typeof queryCrossSourceSchema>;

export const listCalendarEventsSchema = z.object({
  from: isoDate.describe('Inclusive start date of the window.'),
  to: isoDate.describe('Inclusive end date of the window.'),
});
export type ListCalendarEventsArgs = z.infer<typeof listCalendarEventsSchema>;

export const getAvailabilitySchema = z.object({});
export type GetAvailabilityArgs = z.infer<typeof getAvailabilitySchema>;
