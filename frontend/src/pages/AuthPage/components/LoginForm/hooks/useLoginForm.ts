import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/auth/useAuth';
import { ApiError } from '@/shared/api/ApiError';
import { login as loginRequest } from '@/pages/AuthPage/api/login';
import { isValidEmail } from '@/pages/AuthPage/validation';

interface LoginFormValues {
  email: string;
  password: string;
}

interface UseLoginForm {
  values: LoginFormValues;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  submit: () => void;
  submitting: boolean;
  error: string | null;
  canSubmit: boolean;
}

export function useLoginForm(): UseLoginForm {
  const auth = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState<LoginFormValues>({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setEmail = useCallback((email: string): void => {
    setValues((prev) => ({ ...prev, email }));
  }, []);

  const setPassword = useCallback((password: string): void => {
    setValues((prev) => ({ ...prev, password }));
  }, []);

  const canSubmit = isValidEmail(values.email) && values.password !== '' && !submitting;

  const submit = useCallback((): void => {
    if (submitting) {
      return;
    }
    const email = values.email.trim();
    if (!isValidEmail(email) || values.password === '') {
      return;
    }
    setSubmitting(true);
    setError(null);
    loginRequest(email, values.password).then(
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

  return { values, setEmail, setPassword, submit, submitting, error, canSubmit };
}
