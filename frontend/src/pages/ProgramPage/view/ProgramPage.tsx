import type { ReactElement, ReactNode } from 'react';
import { BasketballIcon } from '@/shared/ui/icons/BasketballIcon';
import type { PlannedSession } from '../domain/types';
import { formatDayLabel, themeLabel } from '../domain/format';
import { useProgram } from '../hooks/useProgram';
import { TrainCard } from '../components/TrainCard/TrainCard';
import styles from './ProgramPage.module.css';

export function ProgramPage(): ReactElement {
  const {
    loading,
    error,
    program,
    hasProgram,
    weekIndex,
    week,
    sessions,
    sessionsLoading,
    selectWeek,
  } = useProgram();

  if (loading) {
    return (
      <Shell>
        <p className={styles.muted}>Loading your program…</p>
      </Shell>
    );
  }

  if (error !== null) {
    return (
      <Shell>
        <p className={styles.error}>{error}</p>
      </Shell>
    );
  }

  if (!hasProgram || program === null) {
    return (
      <Shell>
        <p className={styles.muted}>
          You don’t have an active program yet. Finish onboarding and your coach will build one
          toward your goal.
        </p>
      </Shell>
    );
  }

  const lastWeekIndex = program.weeks[program.weeks.length - 1]?.weekIndex ?? 0;
  const firstWeekIndex = program.weeks[0]?.weekIndex ?? 0;
  const isTentative = week?.planState === 'tentative';
  const byDay = groupByDay(sessions);

  return (
    <Shell>
      <header className={styles.goal}>
        <span className={styles.goalEyebrow}>Your goal</span>
        <h1 className={styles.goalTitle}>{program.goalSnapshot.primaryGoal}</h1>
        {program.goalSnapshot.note !== null && (
          <p className={styles.goalNote}>{program.goalSnapshot.note}</p>
        )}
        <p className={styles.adaptNote}>
          Your plan adapts each week to your performance and readiness, always aiming at this goal.
          The next two weeks are shown — later weeks are sketched and may change.
        </p>
      </header>

      <nav className={styles.weekNav}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => selectWeek(weekIndex - 1)}
          disabled={weekIndex <= firstWeekIndex}
          aria-label="Previous week"
        >
          ‹
        </button>
        <div className={styles.weekLabel}>
          <span className={styles.weekTitle}>
            Week {weekIndex + 1}
            {week !== null && (
              <span className={styles.weekTheme}> · {themeLabel(week.theme)}</span>
            )}
          </span>
          {week !== null && (
            <span className={styles.weekDates}>
              {formatDayLabel(week.startDate)} – {formatDayLabel(week.endDate)}
            </span>
          )}
        </div>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => selectWeek(weekIndex + 1)}
          disabled={weekIndex >= lastWeekIndex}
          aria-label="Next week"
        >
          ›
        </button>
      </nav>

      {isTentative && (
        <p className={styles.previewBadge}>Preview — this week may adapt before it’s locked in.</p>
      )}

      {sessionsLoading ? (
        <p className={styles.muted}>Loading trains…</p>
      ) : byDay.length === 0 ? (
        <p className={styles.muted}>No trains scheduled this week.</p>
      ) : (
        <div className={styles.days}>
          {byDay.map(([date, daySessions]) => (
            <section key={date} className={styles.day}>
              <h2 className={styles.dayLabel}>{formatDayLabel(date)}</h2>
              <div className={styles.dayCards}>
                {daySessions.map((s) => (
                  <TrainCard key={s.id} session={s} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <BasketballIcon size={26} />
          <span className={styles.brandName}>AgentiCoach</span>
        </div>
        {children}
      </div>
    </div>
  );
}

// Group sessions into [date, sessions[]] pairs, ascending by date.
function groupByDay(sessions: PlannedSession[]): Array<[string, PlannedSession[]]> {
  const map = new Map<string, PlannedSession[]>();
  for (const s of sessions) {
    const list = map.get(s.scheduledDate) ?? [];
    list.push(s);
    map.set(s.scheduledDate, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}
