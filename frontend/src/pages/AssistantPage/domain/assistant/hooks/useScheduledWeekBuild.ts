import { useCallback, useState } from 'react';
import {
  cancelScheduledWeekBuild,
  listScheduledWeekBuilds,
  scheduleWeekBuild,
} from '../api/assistantApi';
import type { ScheduledWeekBuild } from '../types/assistant';

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface UseScheduledWeekBuildResult {
  // The caller's one pending "plan next week" task, or null if none is set.
  pending: ScheduledWeekBuild | null;
  status: Status;
  error: string | null;
  refresh: () => Promise<void>;
  schedule: (scheduledForUtc: string) => Promise<void>;
  cancel: () => Promise<void>;
}

/** Loads/schedules/cancels the user's next-week build task on demand (popover-driven, no polling). */
export function useScheduledWeekBuild(): UseScheduledWeekBuildResult {
  const [pending, setPending] = useState<ScheduledWeekBuild | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setStatus('loading');
    setError(null);
    try {
      const list = await listScheduledWeekBuilds();
      setPending(list[0] ?? null);
      setStatus('ready');
    } catch {
      setError('Could not load your scheduled build.');
      setStatus('error');
    }
  }, []);

  const schedule = useCallback(async (scheduledForUtc: string): Promise<void> => {
    setError(null);
    try {
      const created = await scheduleWeekBuild(scheduledForUtc);
      setPending(created);
    } catch {
      setError('Could not schedule the build — finish and lock this week first.');
      throw new Error('schedule-failed');
    }
  }, []);

  const cancel = useCallback(async (): Promise<void> => {
    if (!pending) {
      return;
    }
    const { id } = pending;
    setError(null);
    setPending(null);
    try {
      await cancelScheduledWeekBuild(id);
    } catch {
      setError('Could not cancel the scheduled build.');
      await refresh();
    }
  }, [pending, refresh]);

  return { pending, status, error, refresh, schedule, cancel };
}
