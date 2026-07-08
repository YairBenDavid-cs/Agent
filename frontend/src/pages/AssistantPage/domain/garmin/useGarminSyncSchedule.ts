import { useCallback, useState } from 'react';
import {
  fetchGarminSyncSchedule,
  saveGarminSyncSchedule,
  type GarminSyncMode,
  type GarminSyncSchedule,
} from '@/pages/OnboardingPage/api/connections';

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface UseGarminSyncScheduleResult {
  schedule: GarminSyncSchedule | null;
  status: Status;
  error: string | null;
  refresh: () => Promise<void>;
  save: (input: {
    syncTimesLocal: string[];
    mode: GarminSyncMode;
    enabled: boolean;
  }) => Promise<void>;
}

/** Loads/saves the user's recurring Garmin sync schedule on demand (popover-driven). */
export function useGarminSyncSchedule(): UseGarminSyncScheduleResult {
  const [schedule, setSchedule] = useState<GarminSyncSchedule | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setStatus('loading');
    setError(null);
    try {
      const result = await fetchGarminSyncSchedule();
      setSchedule(result);
      setStatus('ready');
    } catch {
      setError('Could not load your sync schedule.');
      setStatus('error');
    }
  }, []);

  const save = useCallback(
    async (input: {
      syncTimesLocal: string[];
      mode: GarminSyncMode;
      enabled: boolean;
    }): Promise<void> => {
      setError(null);
      try {
        const result = await saveGarminSyncSchedule(input);
        setSchedule(result);
      } catch {
        setError('Could not save your sync schedule.');
        throw new Error('save-failed');
      }
    },
    [],
  );

  return { schedule, status, error, refresh, save };
}
