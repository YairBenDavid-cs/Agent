import { z } from 'zod';

/**
 * Free-text-to-scenario classification for a chat message sent while a
 * conversation is in `auto` mode. This is the ONLY place auto-mode infers a
 * scenario from text — once resolved, the scenario is an explicit input to
 * `AutoModeGraph` (see `auto-mode.guardrails.ts`/`auto-mode.graph.ts`), which
 * never re-derives it from prose.
 */
export const autoModeIntentSchema = z.object({
  scenario: z.enum([
    'new_week',
    'weekly_targets_edit',
    'session_edit',
    'session_time_edit',
  ]),
  /** Set only for weekly_targets_edit — omitted fields keep the locked value. */
  sessionCount: z.number().int().positive().nullable().optional(),
  totalVolume: z.number().positive().nullable().optional(),
  keyGoals: z.array(z.string()).nullable().optional(),
  /** Set for session_edit / session_time_edit — which session the user means. */
  plannedSessionId: z.string().nullable().optional(),
  /** session_edit: what to change about the session's content. */
  requestedChangeDescription: z.string().nullable().optional(),
  /** session_time_edit: an explicit slot, if the user named one. */
  requestedDate: z.string().nullable().optional(),
  requestedStartTime: z.string().nullable().optional(),
  /** Short justification, surfaced in the diff/trace and stored as the edit reason. */
  reason: z.string(),
});

export type AutoModeIntent = z.infer<typeof autoModeIntentSchema>;
