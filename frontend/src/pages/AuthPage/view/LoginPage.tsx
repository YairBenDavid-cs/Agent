import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/shared/auth/useAuth';
import { AuthLayout } from '../components/AuthLayout/AuthLayout';
import { LoginForm } from '../components/LoginForm/view/LoginForm';

export function LoginPage(): ReactElement {
  const { user } = useAuth();

  if (user !== null) {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up where Popvich left off."
      prompt="New to AgentiCoach?"
      actionLabel="Create account"
      actionTo="/signup"
    >
      <LoginForm />
    </AuthLayout>
  );
}
