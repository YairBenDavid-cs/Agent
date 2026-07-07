import type { ReactElement } from 'react';
import { useOnboarding } from '../hooks/useOnboarding';
import { DisciplineStep } from '../components/DisciplineStep/DisciplineStep';
import { GoalStep } from '../components/GoalStep/GoalStep';
import { BasicsStep } from '../components/BasicsStep/BasicsStep';
import { LocationStep } from '../components/LocationStep/LocationStep';
import { BodyStep } from '../components/BodyStep/BodyStep';
import { AvailabilityStep } from '../components/AvailabilityStep/AvailabilityStep';
import { RunPrefsStep } from '../components/RunPrefsStep/RunPrefsStep';
import { StrengthPrefsStep } from '../components/StrengthPrefsStep/StrengthPrefsStep';
import { ConnectStep } from '../components/ConnectStep/ConnectStep';
import { Stepper } from '../components/Stepper/Stepper';
import { LogoIcon } from '../components/LogoIcon/LogoIcon';
import styles from './OnboardingPage.module.css';

function Brand(): ReactElement {
  return (
    <div className={styles.brand}>
      <LogoIcon size={28} />
      <span className={styles.brandName}>AgentiCoach</span>
    </div>
  );
}

export function OnboardingPage(): ReactElement {
  const {
    draft,
    dispatch,
    steps,
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
    goTo,
  } = useOnboarding();

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
            discipline={draft.discipline ?? 'running'}
            onChange={(patch) => dispatch({ type: 'patchGoal', patch })}
            disabled={submitting}
          />
        );
      case 'basics':
        return (
          <BasicsStep
            value={draft.profile}
            onChange={(patch) => dispatch({ type: 'patchProfile', patch })}
            disabled={submitting}
          />
        );
      case 'location':
        return (
          <LocationStep
            value={draft.profile}
            onChange={(patch) => dispatch({ type: 'patchProfile', patch })}
            disabled={submitting}
          />
        );
      case 'body':
        return (
          <BodyStep
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

  const nextLabel = isLastStep ? (submitting ? 'Saving…' : 'Finish setup') : 'Continue';

  return (
    <div className={styles.page}>
      <aside className={styles.rail}>
        <Brand />
        <Stepper steps={steps} currentIndex={stepIndex} onSelect={goTo} disabled={submitting} />
      </aside>

      <main className={styles.panel}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.mobileBrand}>
              <Brand />
            </div>
            <div className={styles.eyebrowRow}>
              <span className={styles.eyebrow}>{step.eyebrow}</span>
              <span className={styles.counter}>
                {String(stepIndex + 1).padStart(2, '0')} / {String(stepCount).padStart(2, '0')}
              </span>
            </div>
            <h1 className={styles.title}>{step.title}</h1>
            <p className={styles.subtitle}>{step.subtitle}</p>
          </div>
          <div className={styles.segments} aria-hidden="true">
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={`${styles.segment} ${i <= stepIndex ? styles.segmentOn : ''}`}
              />
            ))}
          </div>
        </header>

        <div className={styles.body}>
          <div className={styles.bodyInner} key={stepIndex}>
            {renderStep()}
            {error !== null && <p className={styles.error}>{error}</p>}
          </div>
        </div>

        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            {!isFirstStep && (
              <button type="button" className={styles.back} onClick={back} disabled={submitting}>
                Back
              </button>
            )}
            <button
              type="button"
              className={styles.next}
              onClick={next}
              disabled={!canAdvance || submitting}
            >
              {nextLabel}
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
