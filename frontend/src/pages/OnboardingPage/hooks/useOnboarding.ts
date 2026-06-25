import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/shared/api/ApiError';
import { submitOnboarding } from '../api/submitOnboarding';
import { buildPayload } from '../domain/buildPayload';
import {
  isAvailabilityStepValid,
  isConnectStepValid,
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

export type StepId =
  | 'discipline'
  | 'goal'
  | 'profile'
  | 'availability'
  | 'prefs'
  | 'connect';

// The Google Calendar OAuth flow navigates the whole tab to Google and back, so
// the in-memory wizard state would be lost. We mirror the draft + current step
// into sessionStorage and restore them on mount so the round-trip is seamless.
const DRAFT_KEY = 'agenticoach.onboarding.draft';
const STEP_KEY = 'agenticoach.onboarding.step';

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
  {
    id: 'connect',
    title: 'Connect your data',
    subtitle: 'Link Garmin and Google Calendar so your coach can plan around you.',
  },
];

const VALIDATORS: Record<StepId, (draft: OnboardingDraft) => boolean> = {
  discipline: isDisciplineStepValid,
  goal: isGoalStepValid,
  profile: isProfileStepValid,
  availability: isAvailabilityStepValid,
  prefs: isPrefsStepValid,
  connect: isConnectStepValid,
};

/** Restore a persisted draft, healing any shape drift against the latest schema. */
function loadDraft(): OnboardingDraft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw === null) {
      return initialDraft;
    }
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    return {
      ...initialDraft,
      ...parsed,
      connections: { ...initialDraft.connections, ...parsed.connections },
    };
  } catch {
    return initialDraft;
  }
}

function loadStepIndex(): number {
  const raw = sessionStorage.getItem(STEP_KEY);
  const index = raw === null ? 0 : Number(raw);
  if (!Number.isInteger(index) || index < 0 || index >= STEPS.length) {
    return 0;
  }
  return index;
}

function clearPersistedDraft(): void {
  sessionStorage.removeItem(DRAFT_KEY);
  sessionStorage.removeItem(STEP_KEY);
}

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
  const [draft, dispatch] = useReducer(onboardingReducer, undefined, loadDraft);
  const [stepIndex, setStepIndex] = useState(loadStepIndex);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep sessionStorage in sync so the Google OAuth redirect can resume here.
  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);
  useEffect(() => {
    sessionStorage.setItem(STEP_KEY, String(stepIndex));
  }, [stepIndex]);

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
        // Profile created — drop the persisted wizard state and head home.
        clearPersistedDraft();
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
