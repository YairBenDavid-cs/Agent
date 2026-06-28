import { z } from 'zod';

/**
 * The Recovery Guru's single output contract: a structured readiness verdict.
 * The Guru is ADVISORY — it never edits planned_sessions. This object is what
 * the orchestrator hands to the Coach (and optionally logs as a preference
 * event). Zod is the source of truth: model-facing JSON Schema + validation.
 */

/** Closed recommendation enum — free text is NOT allowed for the action. */
export const RECOVERY_RECOMMENDATIONS = [
  'proceed',
  'reduce_volume',
  'reduce_intensity',
  'shorten_session',
  'swap_to_active_recovery',
  'rest_day',
] as const;

export const recoveryDriverSchema = z.object({
  metric: z
    .string()
    .describe('Metric name exactly as it appears in the seed, e.g. "acwr_ratio".'),
  value: z
    .string()
    .describe('Observed value as text, optionally with baseline, e.g. "1.6 (status high)".'),
});

export const recoveryParamsSchema = z.object({
  volumePct: z
    .number()
    .nullable()
    .default(null)
    .describe('For reduce_volume: % to cut (e.g. 30 = -30%).'),
  intensityCap: z
    .string()
    .nullable()
    .default(null)
    .describe('For reduce_intensity: HR zone / RPE / pace ceiling, e.g. "Z2" or "RPE<=5".'),
  durationCapMin: z
    .number()
    .nullable()
    .default(null)
    .describe('For shorten_session: max minutes.'),
  activeType: z
    .enum(['mobility', 'easy', 'walk'])
    .nullable()
    .default(null)
    .describe('For swap_to_active_recovery: which active-recovery modality.'),
});

export const recoveryVerdictSchema = z.object({
  readiness: z
    .enum(['green', 'amber', 'red'])
    .describe('Overall readiness band from the explicit thresholds.'),
  drivers: z
    .array(recoveryDriverSchema)
    .describe('The metrics that drove the band — cite only real seed values.'),
  recommendation: z
    .enum(RECOVERY_RECOMMENDATIONS)
    .describe('The single primary action for the Coach to apply.'),
  params: recoveryParamsSchema.default({
    volumePct: null,
    intensityCap: null,
    durationCapMin: null,
    activeType: null,
  }),
  rationale: z
    .string()
    .min(1)
    .describe('2nd-person explanation: lead with the driver, then the action.'),
});
export type RecoveryVerdict = z.infer<typeof recoveryVerdictSchema>;
