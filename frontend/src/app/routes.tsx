import { Navigate, Outlet, type RouteObject } from 'react-router';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { ToastProvider } from '../components/Toast';
import { AdminLayout } from '../layouts/AdminLayout';
import { PublicLayout } from '../layouts/PublicLayout';
import { StudentLayout } from '../layouts/StudentLayout';
import { ActivatePage } from '../pages/auth/ActivatePage';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { AuthProvider } from './AuthProvider';
import { lazyNamed } from './lazyNamed';
import { RootRedirect } from './RootRedirect';
import { RouteErrorPage } from './RouteErrorPage';

// Route-level code splitting: every page below is its own chunk.
const StudentDashboardPage = lazyNamed(
  () => import('../pages/student/StudentDashboardPage'),
  'StudentDashboardPage',
);
const StudentCoursesPage = lazyNamed(
  () => import('../pages/student/StudentCoursesPage'),
  'StudentCoursesPage',
);
const CourseDetailPage = lazyNamed(
  () => import('../pages/student/CourseDetailPage'),
  'CourseDetailPage',
);
const EligibilityPage = lazyNamed(
  () => import('../pages/student/EligibilityPage'),
  'EligibilityPage',
);
const CartPage = lazyNamed(() => import('../pages/student/cart/CartPage'), 'CartPage');
const ResultsPage = lazyNamed(() => import('../pages/student/ResultsPage'), 'ResultsPage');
const WaitlistPage = lazyNamed(() => import('../pages/student/WaitlistPage'), 'WaitlistPage');
const AddDropPage = lazyNamed(() => import('../pages/student/addDrop/AddDropPage'), 'AddDropPage');
const HistoryPage = lazyNamed(() => import('../pages/student/HistoryPage'), 'HistoryPage');
const NotificationsPage = lazyNamed(
  () => import('../pages/student/NotificationsPage'),
  'NotificationsPage',
);
const HelpPage = lazyNamed(() => import('../pages/student/HelpPage'), 'HelpPage');

const AdminDashboardPage = lazyNamed(
  () => import('../pages/admin/AdminDashboardPage'),
  'AdminDashboardPage',
);
const AdminCoursesPage = lazyNamed(
  () => import('../pages/admin/AdminCoursesPage'),
  'AdminCoursesPage',
);
const AdminStudentsPage = lazyNamed(
  () => import('../pages/admin/AdminStudentsPage'),
  'AdminStudentsPage',
);
const AdminStudentDetailPage = lazyNamed(
  () => import('../pages/admin/AdminStudentDetailPage'),
  'AdminStudentDetailPage',
);
const AdminCataloguePage = lazyNamed(
  () => import('../pages/admin/AdminCataloguePage'),
  'AdminCataloguePage',
);
/** One page for both roles; registered under each area so it keeps its layout. */
const AccountPage = lazyNamed(() => import('../pages/AccountPage'), 'AccountPage');
const RegistrationWindowPage = lazyNamed(
  () => import('../pages/admin/RegistrationWindowPage'),
  'RegistrationWindowPage',
);
const AllocationRunsPage = lazyNamed(
  () => import('../pages/admin/AllocationRunsPage'),
  'AllocationRunsPage',
);
const AllocationRunDetailPage = lazyNamed(
  () => import('../pages/admin/AllocationRunDetailPage'),
  'AllocationRunDetailPage',
);
const AdminWaitlistsPage = lazyNamed(
  () => import('../pages/admin/AdminWaitlistsPage'),
  'AdminWaitlistsPage',
);

/**
 * Development-only routes. In a production build import.meta.env.DEV is the
 * literal `false`, so this array is empty and the gallery's chunk is never
 * emitted.
 */
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: 'dev/components',
        Component: lazyNamed(() => import('../pages/dev/DevComponentsPage'), 'DevComponentsPage'),
      },
    ]
  : [];

export const routes: RouteObject[] = [
  {
    path: '/',
    // Providers sit inside the router so they can navigate (e.g. on session expiry).
    element: (
      <ToastProvider>
        <AuthProvider>
          <Outlet />
        </AuthProvider>
      </ToastProvider>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <RootRedirect /> },
      {
        element: <PublicLayout />,
        children: [
          { path: 'login', element: <LoginPage /> },
          // Public by necessity: somebody activating an account or resetting a
          // forgotten password has no session yet. The link's token is the
          // credential, and the server rate-limits these endpoints.
          { path: 'activate', element: <ActivatePage mode="activate" /> },
          { path: 'reset-password', element: <ActivatePage mode="reset" /> },
          { path: 'forgot-password', element: <ForgotPasswordPage /> },
          ...devRoutes,
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      {
        element: <ProtectedRoute role="STUDENT" />,
        children: [
          {
            path: 'student',
            element: <StudentLayout />,
            children: [
              { index: true, element: <Navigate to="dashboard" replace /> },
              { path: 'dashboard', element: <StudentDashboardPage /> },
              { path: 'courses', element: <StudentCoursesPage /> },
              { path: 'courses/:code', element: <CourseDetailPage /> },
              { path: 'eligibility', element: <EligibilityPage /> },
              { path: 'cart', element: <CartPage /> },
              { path: 'results', element: <ResultsPage /> },
              { path: 'waitlist', element: <WaitlistPage /> },
              { path: 'add-drop', element: <AddDropPage /> },
              { path: 'history', element: <HistoryPage /> },
              { path: 'notifications', element: <NotificationsPage /> },
              { path: 'account', element: <AccountPage /> },
              { path: 'help', element: <HelpPage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
      {
        element: <ProtectedRoute role="ADMIN" />,
        children: [
          {
            path: 'admin',
            element: <AdminLayout />,
            children: [
              { index: true, element: <Navigate to="dashboard" replace /> },
              { path: 'dashboard', element: <AdminDashboardPage /> },
              { path: 'courses', element: <AdminCoursesPage /> },
              { path: 'course-catalogue', element: <AdminCataloguePage /> },
              { path: 'students', element: <AdminStudentsPage /> },
              { path: 'students/:rollNumber', element: <AdminStudentDetailPage /> },
              { path: 'account', element: <AccountPage /> },
              { path: 'registration-window', element: <RegistrationWindowPage /> },
              { path: 'allocation-runs', element: <AllocationRunsPage /> },
              { path: 'allocation-runs/:id', element: <AllocationRunDetailPage /> },
              { path: 'waitlists', element: <AdminWaitlistsPage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];
