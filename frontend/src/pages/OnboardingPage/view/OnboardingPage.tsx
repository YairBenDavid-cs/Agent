import type { ReactElement } from 'react';
import { BasketballIcon } from '@/shared/ui/icons/BasketballIcon';
import { BackArrowIcon } from '../components/BackArrowIcon/BackArrowIcon';
import { useOnboarding } from '../hooks/useOnboarding';
import { DisciplineStep } from '../components/DisciplineStep/DisciplineStep';
import { GoalStep } from '../components/GoalStep/GoalStep';
import { ProfileStep } from '../components/ProfileStep/ProfileStep';
import { AvailabilityStep } from '../components/AvailabilityStep/AvailabilityStep';
import { RunPrefsStep } from '../components/RunPrefsStep/RunPrefsStep';
import { StrengthPrefsStep } from '../components/StrengthPrefsStep/StrengthPrefsStep';
import { ConnectStep } from '../components/ConnectStep/ConnectStep';
import styles from './OnboardingPage.module.css';

export function OnboardingPage(): ReactElement {
  const {
    draft,
    dispatch,
    step,
    stepIndex,
    stepCount,
    isFirstStep,
    isLastStep,
    canAdvance,
    submitting,
    error,
    next,
    back,
  } = useOnboarding();

  const progress = Math.round(((stepIndex + 1) / stepCount) * 100);

  function renderStep(): ReactElement {
    switch (step.id) {
      case 'discipline':
        return (
          <DisciplineStep
            value={draft.discipline}
            onChange={(value) => dispatch({ type: 'setDiscipline', value })}
            disabled={submitting}
          />
        );
      case 'goal':
        return (
          <GoalStep
            value={draft.goal}
            onChange={(patch) => dispatch({ type: 'patchGoal', patch })}
            disabled={submitting}
          />
        );
      case 'profile':
        return (
          <ProfileStep
            value={draft.profile}
            onChange={(patch) => dispatch({ type: 'patchProfile', patch })}
            disabled={submitting}
          />
        );
      case 'availability':
        return (
          <AvailabilityStep
            slots={draft.availability}
            sessionDurationMin={draft.sessionDurationMin}
            onSlotsChange={(value) => dispatch({ type: 'setAvailability', value })}
            onDurationChange={(value) => dispatch({ type: 'setSessionDuration', value })}
            disabled={submitting}
          />
        );
      case 'prefs':
        return draft.discipline === 'strength' ? (
          <StrengthPrefsStep
            value={draft.strength}
            onChange={(patch) => dispatch({ type: 'patchStrength', patch })}
            disabled={submitting}
          />
        ) : (
          <RunPrefsStep
            value={draft.run}
            onChange={(patch) => dispatch({ type: 'patchRun', patch })}
            disabled={submitting}
          />
        );
      case 'connect':
        return (
          <ConnectStep
            value={draft.connections}
            onChange={(patch) => dispatch({ type: 'setConnections', patch })}
            disabled={submitting}
          />
        );
      default:
        return <></>;
    }
  }

  const nextLabel = isLastStep ? (submitting ? 'Saving…' : 'Finish') : 'Continue';

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.topBar}>
          <button
            type="button"
            className={styles.backArrow}
            onClick={back}
            disabled={isFirstStep || submitting}
            aria-label="Go back to the previous step"
            title="Back"
          >
            <BackArrowIcon />
          </button>
          <div className={styles.brand}>
            <BasketballIcon size={28} />
            <span className={styles.brandName}>AgentiCoach</span>
          </div>
        </div>

        <div className={styles.progress}>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
          <span className={styles.progressLabel}>
            Step {stepIndex + 1} of {stepCount}
          </span>
        </div>

        <header className={styles.heading}>
          <h1 className={styles.title}>{step.title}</h1>
          <p className={styles.subtitle}>{step.subtitle}</p>
        </header>

        <div className={styles.body}>{renderStep()}</div>

        {error !== null && <p className={styles.error}>{error}</p>}

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.next}
            onClick={next}
            disabled={!canAdvance || submitting}
          >
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
