import { PreferenceTagType } from '../../../personalization/domain/preference-event.model';
import { Pipeline } from '../pipeline.types';
import { TAG_PIPELINE_TABLE, pipelineForTag } from '../tag-routing.table';

// The full tag vocabulary, mirrored from preference-event.model.ts. If a tag is
// added there without a routing entry, this list (and the table) must be updated
// together — that coupling is the point of the exhaustiveness test below.
const ALL_TAGS: PreferenceTagType[] = [
  'disliked_time',
  'disliked_exercise',
  'volume_too_high',
  'volume_too_low',
  'too_hard',
  'too_easy',
  'no_motivation',
  'injury_or_illness',
  'overreaching',
  'time_constraint',
  'weather',
  'travel',
  'equipment_removed',
  'equipment_added',
  'time_window_blocked',
  'time_window_preferred',
  'diversity_request',
  'volume_bias',
  'intensity_bias',
  'modality_pref',
  'exercise_override',
  'injury',
  'session_duration',
  'sessions_per_week',
  'weekly_km',
  'run_type_pref',
  'split_preference',
  'exercises_per_session',
  'default_sets',
  'default_reps',
  'muscle_group_pref',
  'exercise_prescription',
  'experience_level',
  'primary_goal',
  'other',
];

describe('tag-routing.table', () => {
  it('maps every PreferenceTagType to a pipeline', () => {
    for (const tag of ALL_TAGS) {
      expect(TAG_PIPELINE_TABLE[tag]).toBeDefined();
      expect(Object.values(Pipeline)).toContain(TAG_PIPELINE_TABLE[tag]);
    }
  });

  it('has no orphan entries beyond the known vocabulary', () => {
    expect(Object.keys(TAG_PIPELINE_TABLE).sort()).toEqual([...ALL_TAGS].sort());
  });

  it('routes safety tags to SAFETY_REPLAN (Recovery gate first)', () => {
    expect(pipelineForTag('injury_or_illness')).toBe(Pipeline.SAFETY_REPLAN);
    expect(pipelineForTag('injury')).toBe(Pipeline.SAFETY_REPLAN);
    expect(pipelineForTag('overreaching')).toBe(Pipeline.SAFETY_REPLAN);
  });

  it('routes a major goal change to PROGRAM_GENERATION', () => {
    expect(pipelineForTag('primary_goal')).toBe(Pipeline.PROGRAM_GENERATION);
  });

  it('routes pure-timing tags to TIMING_REPLACE (Planner only)', () => {
    expect(pipelineForTag('disliked_time')).toBe(Pipeline.TIMING_REPLACE);
    expect(pipelineForTag('time_window_blocked')).toBe(Pipeline.TIMING_REPLACE);
    expect(pipelineForTag('time_window_preferred')).toBe(Pipeline.TIMING_REPLACE);
    expect(pipelineForTag('time_constraint')).toBe(Pipeline.TIMING_REPLACE);
  });

  it('routes content/training tags to CONTENT_REPLAN', () => {
    expect(pipelineForTag('too_hard')).toBe(Pipeline.CONTENT_REPLAN);
    expect(pipelineForTag('disliked_exercise')).toBe(Pipeline.CONTENT_REPLAN);
    expect(pipelineForTag('weekly_km')).toBe(Pipeline.CONTENT_REPLAN);
    expect(pipelineForTag('session_duration')).toBe(Pipeline.CONTENT_REPLAN);
  });

  it('routes transient/no-impact tags to WRITE_ONLY', () => {
    expect(pipelineForTag('weather')).toBe(Pipeline.WRITE_ONLY);
    expect(pipelineForTag('travel')).toBe(Pipeline.WRITE_ONLY);
    expect(pipelineForTag('other')).toBe(Pipeline.WRITE_ONLY);
  });

  it('falls back to WRITE_ONLY for an unknown tag', () => {
    expect(pipelineForTag('totally_unknown' as PreferenceTagType)).toBe(
      Pipeline.WRITE_ONLY,
    );
  });
});
