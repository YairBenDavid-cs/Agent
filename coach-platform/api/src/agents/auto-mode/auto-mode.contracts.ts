import { z } from 'zod';
import { capturedSignalSchema } from '../assistant/assistant.contracts';

/**
 * Free-text-to-scenario classification for a chat message sent while a
 * conversation is in `auto` mode. This is the ONLY place auto-mode infers a
 * scenario from text — once resolved, the scenario is an explicit input to
 * `AutoModeGraph` (see `auto-mode.guardrails.ts`/`auto-mode.graph.ts`), which
 * never re-derives it from prose.
 *
 * Per the shared INTERVIEW PROTOCOL (see
 * `shared/prompts/interview-protocol.prompt.ts`), this classifier may pause
 * instead of finalizing: either it emits `clarifyingQuestion` (and leaves
 * `scenario`/`reason` null, asking the athlete before anything runs), or it
 * finalizes with `scenario` + a grounded `reason` (and leaves
 * `clarifyingQuestion` null) — never both, never neither.
 */
export const autoModeIntentSchema = z
  .object({
    scenario: z
      .enum(['new_week', 'weekly_targets_edit', 'session_edit', 'session_time_edit'])
      .nullable(),
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
    /**
     * Short, GROUNDED justification (the interview protocol's WHY), surfaced
     * in the diff/trace and stored as the edit reason. Required alongside
     * `scenario`; null while a `clarifyingQuestion` is pending.
     */
    reason: z.string().nullable(),
    /**
     * Set INSTEAD of finalizing when a real dependency (WHY, local-vs-general,
     * which week/session, a numeric trade-off) isn't grounded from the seed or
     * a read-tool. Open-ended, one question at a time, max 5 per change — the
     * conversation history this classifier now sees lets it self-govern the
     * cap and pick up from a prior question on the athlete's next message.
     */
    clarifyingQuestion: z.string().nullable().default(null),
    /**
     * Set only when the athlete confirms this change should ALSO become a
     * standing rule beyond this run's week-scoped edit (LOCAL-vs-GENERAL
     * resolving to GENERAL). Ingested into the same preference log Plan mode
     * writes to, alongside the structural edit `scenario` performs.
     */
    standingPreference: capturedSignalSchema.nullable().default(null),
  })
  .superRefine((v, ctx) => {
    const finalized = v.scenario != null && v.reason != null;
    if ((v.clarifyingQuestion != null) === finalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Either ask a clarifyingQuestion (scenario/reason null), or finalize with scenario + reason (clarifyingQuestion null) — never both, never neither.',
      });
      return;
    }
    if (!finalized) {
      return;
    }
    // A finalized scenario runs straight into an autonomous edit — it must
    // carry everything that edit needs, or the classifier must ask instead.
    switch (v.scenario) {
      case 'session_edit':
        if (v.plannedSessionId == null || v.plannedSessionId.trim() === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['plannedSessionId'],
            message:
              'session_edit requires plannedSessionId — identify the exact session (use a read-tool to find its id), or ask a clarifyingQuestion instead of finalizing.',
          });
        }
        if (
          v.requestedChangeDescription == null ||
          v.requestedChangeDescription.trim() === ''
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['requestedChangeDescription'],
            message:
              'session_edit requires requestedChangeDescription — describe concretely what should change about the session, or ask a clarifyingQuestion instead of finalizing.',
          });
        }
        break;
      case 'session_time_edit':
        if (v.plannedSessionId == null || v.plannedSessionId.trim() === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['plannedSessionId'],
            message:
              'session_time_edit requires plannedSessionId — identify the exact session to move (use a read-tool to find its id), or ask a clarifyingQuestion instead of finalizing.',
          });
        }
        if (v.requestedDate == null && v.requestedStartTime == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['requestedDate'],
            message:
              'session_time_edit requires at least one of requestedDate or requestedStartTime — say when the session should move to, or ask a clarifyingQuestion instead of finalizing.',
          });
        }
        break;
      case 'weekly_targets_edit':
        if (
          v.sessionCount == null &&
          v.totalVolume == null &&
          (v.keyGoals == null || v.keyGoals.length === 0)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['sessionCount'],
            message:
              'weekly_targets_edit requires at least one of sessionCount, totalVolume, or keyGoals — state the concrete target change, or ask a clarifyingQuestion instead of finalizing.',
          });
        }
        break;
      default:
        break;
    }
  });

export type AutoModeIntent = z.infer<typeof autoModeIntentSchema>;
