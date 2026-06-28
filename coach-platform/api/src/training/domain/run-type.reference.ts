/**
 * Enriched reference for the small, fixed RunType vocabulary.
 * Not a catalog (run types are ~6 canonical concepts, not hundreds of messy
 * free-text entities) — just metadata the Coach can use to pick defaults and the
 * Recovery Guru can use to judge intensity. Keyed by the existing RunType enum.
 */

import { RunType } from './training-profile.model';

export type IntensityBand = 'low' | 'moderate' | 'high';

export interface RunTypeReference {
  runType: RunType;
  purpose: string;
  intensityBand: IntensityBand;
  defaultHrZone: number; // 1–5
  defaultRpe: number; // 1–10
}

export const RUN_TYPE_REFERENCE: Record<RunType, RunTypeReference> = {
  easy: {
    runType: 'easy',
    purpose: 'Aerobic base building at a conversational pace.',
    intensityBand: 'low',
    defaultHrZone: 2,
    defaultRpe: 3,
  },
  recovery: {
    runType: 'recovery',
    purpose: 'Active recovery to promote blood flow without adding fatigue.',
    intensityBand: 'low',
    defaultHrZone: 1,
    defaultRpe: 2,
  },
  long: {
    runType: 'long',
    purpose: 'Extended duration to build endurance and fatigue resistance.',
    intensityBand: 'moderate',
    defaultHrZone: 2,
    defaultRpe: 4,
  },
  tempo: {
    runType: 'tempo',
    purpose: 'Sustained effort at or near lactate threshold.',
    intensityBand: 'high',
    defaultHrZone: 4,
    defaultRpe: 7,
  },
  fartlek: {
    runType: 'fartlek',
    purpose: 'Unstructured speed play alternating hard and easy segments.',
    intensityBand: 'high',
    defaultHrZone: 4,
    defaultRpe: 7,
  },
  intervals: {
    runType: 'intervals',
    purpose: 'Structured high-intensity repeats with recovery between reps.',
    intensityBand: 'high',
    defaultHrZone: 5,
    defaultRpe: 9,
  },
};

export function getRunTypeReference(runType: RunType): RunTypeReference {
  return RUN_TYPE_REFERENCE[runType];
}
