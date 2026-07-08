import { useCallback, useEffect, useRef, useState } from 'react';
import { MOCK_API } from '@/shared/config';
import {
  assistantStreamUrl,
  parseWorkflowEvent,
} from '@/pages/AssistantPage/domain/assistant/stream/assistantStream';
import { getBuildConversation } from '@/pages/AssistantPage/domain/assistant/api/assistantApi';
import type { Program, PlannedSession, ProgramWeek, RunAutoModeOutcome } from '../domain/types';
import { fetchActiveProgram, fetchCalendarRange } from '../api/programApi';
import { runAutoMode } from '../api/autoModeApi';
import {
  approveBatch,
  fetchApprovalBatch,
  fetchPendingApprovals,
  regenerateProgram,
  rejectBatch,
  type ApprovalBatchView,
} from '../api/approvalsApi';

interface ProgramState {
  loading: boolean;
  error: string | null;
  program: Program | null;
  hasProgram: boolean;
  weekIndex: number;
  week: ProgramWeek | null;
  sessions: PlannedSession[];
  sessionsLoading: boolean;
  selectWeek: (index: number) => void;
  // The in-flight conversational build chat for the current week, if any. The
  // page surfaces a CTA into it and live-refreshes while it's underway.
  buildConversationId: string | null;
  // Generation (first-time build / re-plan in flight).
  generating: boolean;
  progressText: string;
  genError: string | null;
  retry: () => void;
  // Review / revise of the viewed week's generated draft.
  pendingBatch: ApprovalBatchView | null;
  actionPending: boolean;
  actionError: string | null;
  approve: () => Promise<void>;
  reject: () => Promise<void>;
  // Manual Auto Mode trigger (M4.5) — builds the next week autonomously.
  autoModeRunning: boolean;
  autoModeError: string | null;
  triggerAutoMode: () => Promise<RunAutoModeOutcome | null>;
}

// How long to wait for a generation run to surface a reviewable draft before
// giving up and offering Retry. The pipeline runs synchronously server-side; a
// healthy run is well under this window.
const POLL_MS = 3000;
const MAX_POLLS = 40;
const GENERATING_PROGRESS = 'Your coach is building your program…';

// Turn a pipeline abort reason into something the user can act on. The coaching
// LLM not being configured is an operator/setup problem, not a transient hiccup.
function generationAbortMessage(reason: string | undefined): string {
  if (reason === 'OPENAI_NOT_CONFIGURED') {
    return 'Your coach isn’t available right now. Please try again later.';
  }
  return 'Building your program failed. Please try again.';
}

/**
 * Loads the active program, the selected week's planned trains, and any pending
 * approval draft for that week. On a freshly-onboarded user the current week has
 * no trains yet, so this enters a "generating" state — polling until the server
 * finishes building the week (a pending card batch appears) or the wait lapses.
 */
export function useProgram(): ProgramState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [hasProgram, setHasProgram] = useState(false);
  const [weekIndex, setWeekIndex] = useState(0);

  const [sessions, setSessions] = useState<PlannedSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const [pendingBatch, setPendingBatch] = useState<ApprovalBatchView | null>(null);

  const [generating, setGenerating] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [genError, setGenError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);

  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [autoModeRunning, setAutoModeRunning] = useState(false);
  const [autoModeError, setAutoModeError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const weekTouched = useRef(false);

  // ── Program (re-fetched on reload so week dates reflect a fresh skeleton) ──
  useEffect(() => {
    let active = true;
    if (program === null) setLoading(true);
    fetchActiveProgram()
      .then((res) => {
        if (!active) return;
        setHasProgram(res.hasProgram);
        setProgram(res.program);
        if (res.program && !weekTouched.current) {
          setWeekIndex(res.program.currentWeekIndex);
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load program');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const week = program?.weeks.find((w) => w.weekIndex === weekIndex) ?? null;
  const weekStart = week?.startDate;
  const weekEnd = week?.endDate;

  // ── Planned trains for the selected week ──
  useEffect(() => {
    if (!weekStart || !weekEnd) {
      setSessions([]);
      return;
    }
    let active = true;
    setSessionsLoading(true);
    fetchCalendarRange(weekStart, weekEnd)
      .then((res) => {
        if (active) setSessions(res);
      })
      .catch(() => {
        if (active) setSessions([]);
      })
      .finally(() => {
        if (active) {
          setSessionsLoading(false);
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, weekEnd, reloadKey]);

  // ── Pending approval draft for the selected week (the review/revise surface) ──
  const programId = program?.id ?? null;
  useEffect(() => {
    if (!programId) {
      setPendingBatch(null);
      return;
    }
    let active = true;
    fetchPendingApprovals()
      .then(async (batches) => {
        const match = batches.find(
          (b) => b.programId === programId && b.weekIndex === weekIndex && b.status === 'pending',
        );
        const view = match ? await fetchApprovalBatch(match.id) : null;
        if (active) setPendingBatch(view);
      })
      .catch(() => {
        if (active) setPendingBatch(null);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, weekIndex, reloadKey]);

  // ── Detect an in-flight conversational build ──
  // A freshly-onboarded user's first week is built turn-by-turn in a
  // `program_build` chat (not autonomously). Discover that chat so the page can
  // surface a CTA into it and live-refresh as the coach commits/schedules each
  // session. Re-checked on every reload so it clears once the build is gone.
  const [buildConversationId, setBuildConversationId] = useState<string | null>(null);
  useEffect(() => {
    if (MOCK_API) {
      return;
    }
    let active = true;
    getBuildConversation()
      .then((c) => {
        if (active) setBuildConversationId(c?.id ?? null);
      })
      .catch(() => {
        if (active) setBuildConversationId(null);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  // The build targets the current week; it's done once that week locks.
  const currentWeek =
    program?.weeks.find((w) => w.weekIndex === program.currentWeekIndex) ?? null;
  const buildInProgress =
    buildConversationId !== null && currentWeek !== null && currentWeek.weekState !== 'locked';

  // ── Live-refresh while a build is underway (incremental render) ──
  useEffect(() => {
    if (!buildInProgress) {
      return;
    }
    const interval = setInterval(() => reload(), POLL_MS);
    return () => clearInterval(interval);
  }, [buildInProgress, reload]);

  // ── Exit "generating" once a reviewable draft has appeared ──
  useEffect(() => {
    if (generating && pendingBatch !== null) {
      setGenerating(false);
      setPollCount(0);
    }
  }, [generating, pendingBatch]);

  // ── While generating: live progress beats + poll for completion ──
  useEffect(() => {
    if (!generating) {
      setProgressText('');
      return;
    }
    setProgressText(GENERATING_PROGRESS);

    let source: EventSource | null = null;
    if (!MOCK_API) {
      source = new EventSource(assistantStreamUrl(), { withCredentials: true });
      source.addEventListener('workflow', (event) => {
        if (event instanceof MessageEvent && typeof event.data === 'string') {
          const data = parseWorkflowEvent(event.data);
          if (data) setProgressText(data.detail ?? `${data.agentName}…`);
        }
      });
      source.onerror = () => {
        source?.close();
        source = null;
      };
    }

    const interval = setInterval(() => {
      setPollCount((n) => n + 1);
      reload();
    }, POLL_MS);

    return () => {
      clearInterval(interval);
      source?.close();
    };
  }, [generating, reload]);

  // ── Give up after the wait window lapses ──
  useEffect(() => {
    if (generating && pollCount >= MAX_POLLS) {
      setGenerating(false);
      setGenError('Building your program is taking longer than expected.');
    }
  }, [generating, pollCount]);

  const retry = useCallback(() => {
    setGenError(null);
    setPollCount(0);
    // The pipeline runs synchronously, so the response tells us the outcome
    // directly. An abort (e.g. the LLM isn't configured) would otherwise only
    // surface after the poll window lapses — short-circuit to the error instead.
    regenerateProgram()
      .then((result) => {
        if (result && result.status === 'aborted') {
          setGenerating(false);
          setGenError(generationAbortMessage(result.abortReason));
          return;
        }
        reload();
      })
      .catch(() => reload());
  }, [reload]);

  const selectWeek = useCallback((index: number) => {
    weekTouched.current = true;
    setWeekIndex(index);
  }, []);

  const runAction = useCallback(
    async (fn: () => Promise<unknown>, regen: boolean) => {
      setActionPending(true);
      setActionError(null);
      try {
        await fn();
        if (regen) {
          // A revise fires a fresh re-plan: clear the consumed draft and re-enter
          // the generating poll until the new draft surfaces.
          setPendingBatch(null);
          setPollCount(0);
          setGenerating(true);
        }
        reload();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Action failed. Please try again.');
      } finally {
        setActionPending(false);
      }
    },
    [reload],
  );

  const approve = useCallback(async () => {
    if (!pendingBatch) return;
    await runAction(() => approveBatch(pendingBatch.batchId), false);
  }, [pendingBatch, runAction]);

  const reject = useCallback(async () => {
    if (!pendingBatch) return;
    await runAction(() => rejectBatch(pendingBatch.batchId), false);
  }, [pendingBatch, runAction]);

  const triggerAutoMode = useCallback(async (): Promise<RunAutoModeOutcome | null> => {
    setAutoModeRunning(true);
    setAutoModeError(null);
    try {
      const outcome = await runAutoMode('new_week');
      reload();
      return outcome;
    } catch (err) {
      setAutoModeError(err instanceof Error ? err.message : 'Auto Mode failed. Please try again.');
      return null;
    } finally {
      setAutoModeRunning(false);
    }
  }, [reload]);

  return {
    loading,
    error,
    program,
    hasProgram,
    weekIndex,
    week,
    sessions,
    sessionsLoading,
    selectWeek,
    buildConversationId: buildInProgress ? buildConversationId : null,
    generating,
    progressText,
    genError,
    retry,
    pendingBatch,
    actionPending,
    actionError,
    approve,
    reject,
    autoModeRunning,
    autoModeError,
    triggerAutoMode,
  };
}
