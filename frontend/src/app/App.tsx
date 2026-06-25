import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/shared/auth/AuthProvider';
import { ProtectedRoute } from '@/shared/routing/ProtectedRoute';
import { AuthPage } from '@/pages/AuthPage/view/AuthPage';
import { LoginPage } from '@/pages/AuthPage/view/LoginPage';
import { SignupPage } from '@/pages/AuthPage/view/SignupPage';
import { AssistantPage } from '@/pages/AssistantPage/view/AssistantPage';

export function App(): ReactElement {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route element={<ProtectedRoute />}>
          {/* The assistant dashboard is the landing page after login. */}
          <Route path="/" element={<AssistantPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/assistant/:id" element={<AssistantPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
