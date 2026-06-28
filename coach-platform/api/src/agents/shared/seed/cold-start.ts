/**
 * Pure cold-start detection. A user is "cold" for agent reasoning when there is
 * no domain history to seed from: no active program, no observed sessions, and
 * no performance aggregates. In that state the agents must lean on the
 * onboarding survey (training profile) + the initial wearable sync as the
 * baseline, and null domain facts fall back gracefully rather than misleading
 * the model into thinking the user has a track record.
 */
export interface ColdStartSignals {
  hasProgram: boolean;
  observedSessionCount: number;
  performanceCount: number;
}

export function detectColdStart(signals: ColdStartSignals): boolean {
  return (
    !signals.hasProgram &&
    signals.observedSessionCount === 0 &&
    signals.performanceCount === 0
  );
}
