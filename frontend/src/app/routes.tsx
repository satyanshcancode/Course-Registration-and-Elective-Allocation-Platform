import type { RouteObject } from 'react-router';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { RootLayout } from '../layouts/RootLayout';
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { StudentDashboardPage } from '../pages/student/StudentDashboardPage';
import { AuthProvider } from './AuthProvider';

export const routes: RouteObject[] = [
  {
    path: '/',
    // AuthProvider sits inside the router so it can redirect on session expiry.
    element: (
      <AuthProvider>
        <RootLayout />
      </AuthProvider>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'login', element: <LoginPage /> },
      {
        element: <ProtectedRoute role="STUDENT" />,
        children: [{ path: 'student', element: <StudentDashboardPage /> }],
      },
      {
        element: <ProtectedRoute role="ADMIN" />,
        children: [{ path: 'admin', element: <AdminDashboardPage /> }],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
