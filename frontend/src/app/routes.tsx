import type { RouteObject } from 'react-router';
import { RootLayout } from '../layouts/RootLayout';
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { StudentDashboardPage } from '../pages/student/StudentDashboardPage';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'student', element: <StudentDashboardPage /> },
      { path: 'admin', element: <AdminDashboardPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
