import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/shared/auth/useAuth';
import { AuthLayout } from '../components/AuthLayout/AuthLayout';
import { SignupForm } from '../components/SignupForm/view/SignupForm';

export function SignupPage(): ReactElement {
  const { user } = useAuth();

  if (user !== null) {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthLayout
      title="Create your account"
      prompt="Already have an account?"
      actionLabel="Log in"
      actionTo="/login"
    >
      <SignupForm />
    </AuthLayout>
  );
}
