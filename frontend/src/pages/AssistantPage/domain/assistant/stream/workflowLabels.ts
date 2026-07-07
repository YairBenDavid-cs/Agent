import type { WorkflowProgress } from './assistantStream';

// What the thinking indicator shows: a title (who is working) and an optional
// sub-line (what they're doing right now).
export interface ProgressLabel {
  title: string;
  subtitle?: string;
}

const DEFAULT_TITLE = 'Popvich is thinking';

// agentName (from the SSE workflow beat) → human title. `assistant` is Popvich
// himself; the rest are the specialists he delegates to.
const AGENT_TITLES: Record<string, string> = {
  assistant: DEFAULT_TITLE,
  recovery: 'Recovery Guru',
  coach: 'Coach',
  'coach-advisory': 'Coach',
  planner: 'Planner',
};

// tool name (workflow beat `detail`) → "what it's doing" sub-line. Covers the
// delegation tools and the read-tool registry; unknown tools fall back to a
// humanized form of the snake_case name.
const TOOL_SUBTITLES: Record<string, string> = {
  ask_recovery: 'Consulting the Recovery Guru',
  ask_coach: 'Consulting the Coach',
  query_performance: 'Checking your performance',
  query_recovery: 'Checking your recovery',
  query_planned_sessions: 'Reading your week',
  get_week: 'Reading your week',
  query_sessions: 'Reviewing your sessions',
  query_adherence: 'Checking your adherence',
  query_cross_source: 'Cross-checking your data',
  get_preference_events: 'Recalling your preferences',
  search_exercise_catalog: 'Searching exercises',
  get_exercise_detail: 'Looking up an exercise',
  list_calendar_events: 'Checking your calendar',
  get_availability: 'Checking your availability',
};

function humanizeToolName(name: string): string {
  const words = name.replace(/_/g, ' ').trim();
  if (words === '') {
    return '';
  }
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function titleForAgent(agentName: string): string {
  const known = AGENT_TITLES[agentName];
  if (known !== undefined) {
    return known;
  }
  return humanizeToolName(agentName);
}

function subtitleForDetail(detail: string): string {
  return TOOL_SUBTITLES[detail] ?? humanizeToolName(detail);
}

/**
 * Turn the latest workflow beat into the indicator's title + sub-line. With no
 * beat yet (turn just started, or a dropped stream) it's plain "Popvich is
 * thinking". A specialist's own beat retitles to that specialist; a tool beat
 * (from Popvich or a specialist) adds the "what it's doing" sub-line.
 */
export function describeProgress(progress: WorkflowProgress | null): ProgressLabel {
  if (progress === null) {
    return { title: DEFAULT_TITLE };
  }
  const label: ProgressLabel = { title: titleForAgent(progress.agentName) };
  if (progress.detail !== undefined && progress.detail !== '') {
    label.subtitle = subtitleForDetail(progress.detail);
  }
  return label;
}
