import type { ReactElement } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/shared/auth/useAuth';

export function ProtectedRoute(): ReactElement {
  const { session } = useAuth();
  if (session === null) {
    return <Navigate to="/auth" replace />;
  }
  return <Outlet />;
}
