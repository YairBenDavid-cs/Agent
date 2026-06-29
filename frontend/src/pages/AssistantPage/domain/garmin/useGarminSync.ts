import { useCallback, useEffect, useRef, useState } from 'react';
import { MOCK_API } from '@/shared/config';
import {
  fetchIntegrationStatuses,
  runGarminSync,
  type GarminSyncStatus,
} from '@/pages/OnboardingPage/api/connections';

const SYNC_POLL_MS = 2000;
const MAX_SYNC_POLLS = 30; // ~60s before we treat the run as failed

interface UseGarminSyncOptions {
  /** Fired once a manual sync lands data (terminal 'synced'). */
  onSynced: () => void;
  /** Fired when a sync can't pull data (sync_failed or timeout). */
  onError: (message: string) => void;
  /** Fired when Garmin rejects the stored session and the user must re-link. */
  onReconnect: () => void;
}

interface UseGarminSync {
  /** Whether a Garmin link exists for this user — gates the button's visibility. */
  visible: boolean;
  /** A manual run (or a still-in-flight backfill) is in progress. */
  syncing: boolean;
  lastSyncedAt: string | null;
  /** Fire a manual ingestion run, or route to re-link when auth has failed. */
  sync: () => void;
}

/**
 * Drives the chat sidebar's Garmin sync button. Reads the current integration
 * status on mount to decide whether the button shows at all, then on click
 * re-runs the same `/ingestion/run` backfill the daily cron uses and polls the
 * status to a terminal state. An `auth_failed` status routes the user back to
 * re-link rather than firing a doomed run.
 */
export function useGarminSync({
  onSynced,
  onError,
  onReconnect,
}: UseGarminSyncOptions): UseGarminSync {
  const [visible, setVisible] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const mounted = useRef(true);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback((): void => {
    if (pollTimer.current !== null) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  // Reflect the stored Garmin status so the button only shows when linked, and
  // surfaces the last successful sync time.
  useEffect(() => {
    mounted.current = true;
    fetchIntegrationStatuses()
      .then((statuses) => {
        if (!mounted.current) return;
        const garmin = statuses.find((s) => s.provider === 'garmin');
        if (!garmin) return;
        setVisible(garmin.connected || garmin.syncStatus != null);
        setAuthFailed(garmin.syncStatus === 'auth_failed');
        setLastSyncedAt(garmin.lastSyncedAt ?? null);
      })
      .catch(() => {
        /* Best-effort: if we can't read status, keep the button hidden. */
      });
    return () => {
      mounted.current = false;
      clearPoll();
    };
  }, [clearPoll]);

  const settle = useCallback(
    (status: GarminSyncStatus | 'timeout'): void => {
      clearPoll();
      if (!mounted.current) return;
      setSyncing(false);
      if (status === 'synced') {
        setLastSyncedAt(new Date().toISOString());
        onSynced();
      } else if (status === 'auth_failed') {
        setAuthFailed(true);
        onReconnect();
      } else {
        onError('We couldn’t pull your Garmin data. Please try again.');
      }
    },
    [clearPoll, onSynced, onReconnect, onError],
  );

  const sync = useCallback((): void => {
    if (syncing) return;
    if (authFailed) {
      onReconnect();
      return;
    }

    setSyncing(true);

    if (MOCK_API) {
      setTimeout(() => settle('synced'), 600);
      return;
    }

    runGarminSync().catch(() => {
      /* The authoritative outcome is read back by the poll below. */
    });

    let polls = 0;
    clearPoll();
    pollTimer.current = setInterval(() => {
      polls += 1;
      fetchIntegrationStatuses()
        .then((statuses) => {
          const status = statuses.find((s) => s.provider === 'garmin')?.syncStatus ?? null;
          if (status === 'synced') {
            settle('synced');
          } else if (status === 'auth_failed') {
            settle('auth_failed');
          } else if (status === 'sync_failed' || polls >= MAX_SYNC_POLLS) {
            settle('sync_failed');
          }
          // 'syncing' / null → keep polling.
        })
        .catch(() => {
          if (polls >= MAX_SYNC_POLLS) settle('timeout');
        });
    }, SYNC_POLL_MS);
  }, [syncing, authFailed, onReconnect, settle, clearPoll]);

  return { visible, syncing, lastSyncedAt, sync };
}
