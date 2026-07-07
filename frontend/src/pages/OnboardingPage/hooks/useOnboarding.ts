import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/shared/api/ApiError';
import { getBuildConversation } from '@/pages/AssistantPage/domain/assistant/api/assistantApi';
import { submitOnboarding } from '../api/submitOnboarding';
import { buildPayload } from '../domain/buildPayload';
import {
  isAvailabilityStepValid,
  isBasicsStepValid,
  isBodyStepValid,
  isConnectStepValid,
  isDisciplineStepValid,
  isGoalStepValid,
  isLocationStepValid,
  isPrefsStepValid,
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
  | 'basics'
  | 'location'
  | 'body'
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
  /** Short uppercase eyebrow above the title in the panel. */
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Compact title shown on the left stepper rail. */
  railTitle: string;
  /** One-line caption under the rail title. */
  railSubtitle: string;
}

const STEPS: StepMeta[] = [
  {
    id: 'discipline',
    eyebrow: 'Discipline',
    title: 'What do you train?',
    subtitle: 'Pick the focus for your next block.',
    railTitle: 'Discipline',
    railSubtitle: 'What you train',
  },
  {
    id: 'goal',
    eyebrow: 'Your goal',
    title: 'Your 3-month goal',
    subtitle: 'What should this block move you toward?',
    railTitle: 'Goal',
    railSubtitle: 'Your target',
  },
  {
    id: 'basics',
    eyebrow: 'Profile',
    title: 'About you',
    subtitle: 'A few basics so plans fit your body.',
    railTitle: 'Basics',
    railSubtitle: 'You & your birthday',
  },
  {
    id: 'location',
    eyebrow: 'Profile',
    title: 'Where are you based?',
    subtitle: 'So sessions land at the right local time.',
    railTitle: 'Location',
    railSubtitle: 'Country & time zone',
  },
  {
    id: 'body',
    eyebrow: 'Profile',
    title: 'Your measurements',
    subtitle: 'Optional — helps us size training load.',
    railTitle: 'Body',
    railSubtitle: 'Height & weight',
  },
  {
    id: 'availability',
    eyebrow: 'Availability',
    title: 'When can you train?',
    subtitle: 'Set the weekly windows you can commit to.',
    railTitle: 'Availability',
    railSubtitle: 'Your schedule',
  },
  {
    id: 'prefs',
    eyebrow: 'Preferences',
    title: 'Your preferences',
    subtitle: 'Dial in the details of your sessions.',
    railTitle: 'Preferences',
    railSubtitle: 'Fine-tuning',
  },
  {
    id: 'connect',
    eyebrow: 'Connect',
    title: 'Connect your data',
    subtitle: 'Link Garmin and Google Calendar so your coach can plan around you.',
    railTitle: 'Connect',
    railSubtitle: 'Your data',
  },
];

const VALIDATORS: Record<StepId, (draft: OnboardingDraft) => boolean> = {
  discipline: isDisciplineStepValid,
  goal: isGoalStepValid,
  basics: isBasicsStepValid,
  location: isLocationStepValid,
  body: isBodyStepValid,
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

// The server opens the program_build chat asynchronously (a listener on the
// training-profile event seeds the program, then opens the chat). Poll briefly
// for it after submit so we can land the user directly in the build. Resolves
// with the conversation id, or null if it doesn't appear within the window.
const BUILD_POLL_MS = 1500;
const BUILD_POLL_ATTEMPTS = 14; // ~21s — generous headroom for the kickoff.

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function pollForBuildConversation(): Promise<string | null> {
  for (let attempt = 0; attempt < BUILD_POLL_ATTEMPTS; attempt += 1) {
    try {
      const conversation = await getBuildConversation();
      if (conversation !== null) {
        return conversation.id;
      }
    } catch {
      // Transient — keep polling until the window lapses.
    }
    await delay(BUILD_POLL_MS);
  }
  return null;
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
  steps: StepMeta[];
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
  /** Jump to an already-reached step (index <= current). Never skips ahead. */
  goTo: (index: number) => void;
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
      async () => {
        // Profile created. The server opens a `program_build` chat where the coach
        // walks the user through their first week (no autonomous generation). Drop
        // the persisted wizard state, then poll for that chat and land the user in
        // it. If it doesn't appear in time, fall back to the program view.
        clearPersistedDraft();
        const conversationId = await pollForBuildConversation();
        if (conversationId !== null) {
          navigate(`/assistant/${conversationId}`, { replace: true });
        } else {
          navigate('/program', { replace: true, state: { fromOnboarding: true } });
        }
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

  const goTo = useCallback(
    (index: number): void => {
      setError(null);
      // Only allow revisiting steps already reached — never skip ahead.
      setStepIndex((prev) => (index >= 0 && index <= prev ? index : prev));
    },
    [],
  );

  return {
    draft,
    dispatch,
    steps: STEPS,
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
    goTo,
  };
}
