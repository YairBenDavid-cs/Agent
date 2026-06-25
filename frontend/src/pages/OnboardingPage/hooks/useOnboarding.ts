import { useCallback, useMemo, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/shared/api/ApiError';
import { submitOnboarding } from '../api/submitOnboarding';
import { buildPayload } from '../domain/buildPayload';
import {
  isAvailabilityStepValid,
  isDisciplineStepValid,
  isGoalStepValid,
  isPrefsStepValid,
  isProfileStepValid,
} from '../domain/validation';
import {
  initialDraft,
  onboardingReducer,
  type OnboardingAction,
  type OnboardingDraft,
} from '../state/onboardingDraft';

export type StepId = 'discipline' | 'goal' | 'profile' | 'availability' | 'prefs';

interface StepMeta {
  id: StepId;
  title: string;
  subtitle: string;
}

const STEPS: StepMeta[] = [
  { id: 'discipline', title: 'What do you train?', subtitle: 'Pick the focus for your next block.' },
  { id: 'goal', title: 'Your 3-month goal', subtitle: 'What should this block move you toward?' },
  { id: 'profile', title: 'About you', subtitle: 'A few basics so plans fit your body.' },
  {
    id: 'availability',
    title: 'When can you train?',
    subtitle: 'Add the weekly windows you can commit to.',
  },
  { id: 'prefs', title: 'Your preferences', subtitle: 'Dial in the details of your sessions.' },
];

const VALIDATORS: Record<StepId, (draft: OnboardingDraft) => boolean> = {
  discipline: isDisciplineStepValid,
  goal: isGoalStepValid,
  profile: isProfileStepValid,
  availability: isAvailabilityStepValid,
  prefs: isPrefsStepValid,
};

/** Safe lookup — stepIndex is always in range, but the compiler can't prove it. */
function stepAt(index: number): StepMeta {
  const meta = STEPS[index];
  if (meta === undefined) {
    throw new Error(`No onboarding step at index ${index}`);
  }
  return meta;
}

interface UseOnboarding {
  draft: OnboardingDraft;
  dispatch: (action: OnboardingAction) => void;
  step: StepMeta;
  stepIndex: number;
  stepCount: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  canAdvance: boolean;
  submitting: boolean;
  error: string | null;
  next: () => void;
  back: () => void;
}

export function useOnboarding(): UseOnboarding {
  const navigate = useNavigate();
  const [draft, dispatch] = useReducer(onboardingReducer, initialDraft);
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = stepAt(stepIndex);
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === STEPS.length - 1;
  const canAdvance = useMemo(() => VALIDATORS[step.id](draft), [step.id, draft]);

  const finish = useCallback((): void => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    submitOnboarding(buildPayload(draft)).then(
      () => {
        // Profile created — the assistant dashboard is now the home screen.
        navigate('/', { replace: true });
      },
      (err: unknown) => {
        setError(
          err instanceof ApiError ? err.message : 'Could not save your profile. Please try again.',
        );
        setSubmitting(false);
      },
    );
  }, [submitting, draft, navigate]);

  const next = useCallback((): void => {
    if (!VALIDATORS[stepAt(stepIndex).id](draft)) {
      return;
    }
    if (stepIndex === STEPS.length - 1) {
      finish();
      return;
    }
    setStepIndex((prev) => prev + 1);
  }, [stepIndex, draft, finish]);

  const back = useCallback((): void => {
    setError(null);
    setStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  return {
    draft,
    dispatch,
    step,
    stepIndex,
    stepCount: STEPS.length,
    isFirstStep,
    isLastStep,
    canAdvance,
    submitting,
    error,
    next,
    back,
  };
}
