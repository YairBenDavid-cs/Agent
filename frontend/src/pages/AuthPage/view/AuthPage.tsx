import { useState, type ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/shared/auth/useAuth';
import { Header } from '../components/Header/Header';
import { LoginForm } from '../components/LoginForm/view/LoginForm';
import { SignupForm } from '../components/SignupForm/view/SignupForm';
import styles from './AuthPage.module.css';

type AuthMode = 'login' | 'signup';

const COPY: Record<AuthMode, { title: string; prompt: string; action: string }> = {
  login: { title: 'Welcome back', prompt: 'Need an account?', action: 'Sign up' },
  signup: { title: 'Create your account', prompt: 'Already have an account?', action: 'Log in' },
};

export function AuthPage(): ReactElement {
  const { session } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');

  if (session !== null) {
    return <Navigate to="/" replace />;
  }

  const copy = COPY[mode];

  function toggleMode(): void {
    setMode((prev) => (prev === 'login' ? 'signup' : 'login'));
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Header title={copy.title} />
        {mode === 'login' ? <LoginForm /> : <SignupForm />}
        <p className={styles.toggle}>
          {copy.prompt}{' '}
          <button type="button" className={styles.toggleButton} onClick={toggleMode}>
            {copy.action}
          </button>
        </p>
      </div>
    </div>
  );
}
