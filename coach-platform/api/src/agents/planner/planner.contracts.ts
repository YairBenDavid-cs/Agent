import { z } from 'zod';

/**
 * The Planner's single terminal contract: one consolidated placement decision
 * over the whole week. The LLM reasons over the live calendar + availability +
 * windows and emits `placed` (with the schedule it chose) plus `unplaceable`
 * (sessions it could not fit, with the reason + nearest rejected options). The
 * pre-write validator guards `placed` before any of it is persisted.
 */

const isoDate = z.string().describe('YYYY-MM-DD (local).');
const hhmm = z.string().describe('"HH:mm" 24h local wall-clock.');

export const placedSessionSchema = z.object({
  plannedSessionId: z
    .string()
    .describe('Id of the tentative session being scheduled.'),
  scheduledDate: isoDate,
  startTime: hhmm,
  endTime: hhmm,
  scheduledStartUtc: z
    .string()
    .describe('ISO instant for startTime converted from the seed timezone.'),
  placementNote: z
    .string()
    .min(1)
    .describe('Why this slot/day (persisted for the "why this time?" answer).'),
});
export type PlacedSession = z.infer<typeof placedSessionSchema>;

export const unplaceableSchema = z.object({
  plannedSessionId: z.string(),
  reason: z.string().min(1).describe('Why it could not be placed this week.'),
  nearestRejectedOptions: z
    .array(z.string())
    .default([])
    .describe('Close-but-rejected slots, for the conflict card.'),
});
export type Unplaceable = z.infer<typeof unplaceableSchema>;

export const commitPlacementSchema = z.object({
  programId: z.string(),
  weekIndex: z.number().int().min(0),
  timezone: z.string().describe('IANA tz the local times were resolved against.'),
  placed: z.array(placedSessionSchema).default([]),
  unplaceable: z.array(unplaceableSchema).default([]),
});
export type CommitPlacementArgs = z.infer<typeof commitPlacementSchema>;

/** The placement report the Planner returns (and the orchestrator surfaces). */
export interface PlacementReport {
  placedCount: number;
  unplaceable: Unplaceable[];
}
