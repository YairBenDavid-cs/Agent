import { useCallback, useEffect, useState } from 'react';
import type { Program, PlannedSession, ProgramWeek } from '../domain/types';
import { fetchActiveProgram, fetchCalendarRange } from '../api/programApi';

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
}

// Loads the active program once, then lazily loads the planned trains for the
// selected week's date range. Week selection starts at the program's current
// week so the user lands on "this week".
export function useProgram(): ProgramState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [hasProgram, setHasProgram] = useState(false);
  const [weekIndex, setWeekIndex] = useState(0);

  const [sessions, setSessions] = useState<PlannedSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchActiveProgram()
      .then((res) => {
        if (!active) return;
        setHasProgram(res.hasProgram);
        setProgram(res.program);
        if (res.program) {
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
  }, []);

  const week = program?.weeks.find((w) => w.weekIndex === weekIndex) ?? null;
  const weekStart = week?.startDate;
  const weekEnd = week?.endDate;

  useEffect(() => {
    if (!weekStart || !weekEnd) return;
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
        if (active) setSessionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [weekStart, weekEnd]);

  const selectWeek = useCallback((index: number) => {
    setWeekIndex(index);
  }, []);

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
  };
}
