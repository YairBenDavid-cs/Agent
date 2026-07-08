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

/**
 * BW3 conversational slot offer — the LLM's terminal contract when talking a
 * user into a time. Every pick is either a pool candidate (matched by
 * scheduledDate+startTime) or an exact athlete-requested time that the handler
 * validates LIVE (availability + busy + hard windows + one-session-per-day);
 * anything unfree bounces, so the model can never offer a clashing time.
 */
export const offerSlotsSchema = z.object({
  message: z
    .string()
    .min(1)
    .describe(
      'The chat message shown above the slot picks. Warm, short, no emojis. ' +
        'Do NOT restate the times in the text — the picks render below it.',
    ),
  picks: z
    .array(
      z.object({
        scheduledDate: isoDate,
        startTime: hhmm,
      }),
    )
    .min(1)
    .max(3)
    .describe(
      '1–3 slots, best first: from the candidate pool, or an exact time the ' +
        'athlete requested (validated live; bounced with the reason if unfree).',
    ),
});
export type OfferSlotsArgs = z.infer<typeof offerSlotsSchema>;

/**
 * BW3 mid-conversation preference capture: when the athlete explicitly states
 * a scheduling preference meant to outlive this pick ("I generally prefer
 * evenings", "never before 8", "this week only mornings"), the model records
 * it into the personalization log before offering.
 */
export const saveTimePreferenceSchema = z.object({
  kind: z
    .enum(['preferred', 'blocked'])
    .describe('preferred = they want this window; blocked = keep away from it.'),
  durability: z
    .enum(['standing', 'one_off'])
    .describe('standing = general/going forward; one_off = this week only.'),
  summary: z
    .string()
    .min(1)
    .describe(
      'Compact window descriptor, e.g. "evenings 19:00-21:00", ' +
        '"weekday mornings", "mon".',
    ),
  rawText: z
    .string()
    .min(1)
    .describe("The athlete's own words that stated this preference."),
});
export type SaveTimePreferenceArgs = z.infer<typeof saveTimePreferenceSchema>;
