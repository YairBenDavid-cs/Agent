import type { ReactElement, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BasketballIcon } from '@/shared/ui/icons/BasketballIcon';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import type { Program } from '../domain/types';
import { formatDayLabel, themeLabel } from '../domain/format';
import { useProgram } from '../hooks/useProgram';
import { TrainCard } from '../components/TrainCard/TrainCard';
import { WeekReview } from '../components/WeekReview/WeekReview';
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
    generating,
    progressText,
    genError,
    retry,
    pendingBatch,
    actionPending,
    actionError,
    approve,
    revise,
    reject,
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

  if (generating) {
    return (
      <Shell>
        <GoalHeader program={program} />
        <div className={styles.generating}>
          <Spinner />
          <p className={styles.muted}>{progressText || 'Your coach is building your program…'}</p>
        </div>
      </Shell>
    );
  }

  if (genError !== null) {
    return (
      <Shell>
        <GoalHeader program={program} />
        <p className={styles.error}>{genError}</p>
        <button type="button" className={styles.retry} onClick={retry}>
          Try again
        </button>
      </Shell>
    );
  }

  const lastWeekIndex = program.weeks[program.weeks.length - 1]?.weekIndex ?? 0;
  const firstWeekIndex = program.weeks[0]?.weekIndex ?? 0;
  const isTentative = week?.planState === 'tentative';
  const sortedSessions = [...sessions].sort((a, b) =>
    a.scheduledStartUtc.localeCompare(b.scheduledStartUtc),
  );

  return (
    <Shell>
      <GoalHeader program={program} />

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

      {pendingBatch ? (
        <WeekReview
          batch={pendingBatch}
          sessions={sessions}
          pending={actionPending}
          error={actionError}
          onApprove={approve}
          onRevise={revise}
          onReject={reject}
        />
      ) : (
        <>
          {isTentative && (
            <p className={styles.previewBadge}>
              Preview — this week may adapt before it’s locked in.
            </p>
          )}

          {sessionsLoading ? (
            <p className={styles.muted}>Loading trains…</p>
          ) : sortedSessions.length === 0 ? (
            <p className={styles.muted}>No trains scheduled this week.</p>
          ) : (
            <div className={styles.cardGrid}>
              {sortedSessions.map((s) => (
                <TrainCard key={s.id} session={s} />
              ))}
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

// The goal banner — shown across the loading, generating, and ready states so
// the user always sees what their program is aiming at.
function GoalHeader({ program }: { program: Program }): ReactElement {
  return (
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
  );
}

function Shell({ children }: { children: ReactNode }): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as
    | { fromOnboarding?: boolean; fromConversationId?: string | null }
    | null;
  // Hide the back-to-chat link during the post-onboarding review: the user
  // arrives here straight from the wizard and should focus on their first
  // program before returning to the chat.
  const fromOnboarding = navState?.fromOnboarding === true;
  // Return to the conversation the user had open before opening the program,
  // rather than dropping them on the new-chat start screen.
  const fromConversationId = navState?.fromConversationId ?? null;
  const backToChatPath =
    fromConversationId !== null ? `/assistant/${fromConversationId}` : '/assistant';

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.topBar}>
          <div className={styles.brand}>
            <BasketballIcon size={26} />
            <span className={styles.brandName}>AgentiCoach</span>
          </div>
          {!fromOnboarding && (
            <button
              type="button"
              className={styles.backToChat}
              onClick={() => navigate(backToChatPath)}
            >
              ‹ Back to chat
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
