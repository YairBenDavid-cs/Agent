import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/auth/useAuth';
import { ApiError } from '@/shared/api/ApiError';
import { signup as signupRequest } from '@/pages/AuthPage/api/signup';
import { isValidEmail, MIN_PASSWORD_LENGTH } from '@/pages/AuthPage/validation';

interface SignupFormValues {
  email: string;
  password: string;
  name: string;
}

interface UseSignupForm {
  values: SignupFormValues;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  setName: (value: string) => void;
  submit: () => void;
  submitting: boolean;
  error: string | null;
  canSubmit: boolean;
}

export function useSignupForm(): UseSignupForm {
  const auth = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState<SignupFormValues>({ email: '', password: '', name: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setEmail = useCallback((email: string): void => {
    setValues((prev) => ({ ...prev, email }));
  }, []);

  const setPassword = useCallback((password: string): void => {
    setValues((prev) => ({ ...prev, password }));
  }, []);

  const setName = useCallback((name: string): void => {
    setValues((prev) => ({ ...prev, name }));
  }, []);

  const canSubmit =
    isValidEmail(values.email) &&
    values.password.length >= MIN_PASSWORD_LENGTH &&
    values.name.trim() !== '' &&
    !submitting;

  const submit = useCallback((): void => {
    if (submitting) {
      return;
    }
    const email = values.email.trim();
    const name = values.name.trim();
    if (!isValidEmail(email) || values.password.length < MIN_PASSWORD_LENGTH || name === '') {
      return;
    }
    setSubmitting(true);
    setError(null);
    signupRequest(email, values.password, name).then(
      (session) => {
        auth.login(session);
        navigate('/', { replace: true });
      },
      (err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
        setSubmitting(false);
      },
    );
  }, [submitting, values, auth, navigate]);

  return { values, setEmail, setPassword, setName, submit, submitting, error, canSubmit };
}
