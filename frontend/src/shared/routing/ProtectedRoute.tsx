import type { ReactElement } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/shared/auth/useAuth';
import { Spinner } from '@/shared/ui/Spinner/Spinner';

export function ProtectedRoute(): ReactElement {
  const { user, loading } = useAuth();

  // Wait for the initial session check before deciding — otherwise a logged-in
  // user gets bounced to /auth on every hard refresh.
  if (loading) {
    return <Spinner />;
  }
  if (user === null) {
    return <Navigate to="/auth" replace />;
  }
  return <Outlet />;
}
