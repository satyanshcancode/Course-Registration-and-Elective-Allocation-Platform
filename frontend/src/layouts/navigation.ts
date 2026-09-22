import {
  ArrowLeftRight,
  BadgeCheck,
  Bell,
  BookOpen,
  CalendarClock,
  CircleHelp,
  History,
  Hourglass,
  LayoutDashboard,
  ListChecks,
  ListOrdered,
  ShoppingCart,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shorter label for the phone bottom bar. */
  shortLabel?: string;
  /** Shown directly in the phone bottom bar (the rest go under "More"). */
  primaryOnMobile?: boolean;
}

/** Only in-scope pages (see docs/PROBLEM_STATEMENT.md). */
export const STUDENT_NAV: readonly NavItem[] = [
  { to: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard, primaryOnMobile: true },
  { to: '/student/courses', label: 'Courses', icon: BookOpen, primaryOnMobile: true },
  { to: '/student/eligibility', label: 'Eligibility', icon: BadgeCheck },
  {
    to: '/student/cart',
    label: 'My Cart',
    shortLabel: 'Cart',
    icon: ShoppingCart,
    primaryOnMobile: true,
  },
  { to: '/student/results', label: 'Results', icon: ListChecks, primaryOnMobile: true },
  { to: '/student/waitlist', label: 'Waitlist', icon: Hourglass },
  { to: '/student/add-drop', label: 'Add/Drop', icon: ArrowLeftRight },
  { to: '/student/history', label: 'History', icon: History },
  { to: '/student/notifications', label: 'Notifications', icon: Bell },
  { to: '/student/help', label: 'Help', icon: CircleHelp },
];

export const ADMIN_NAV: readonly NavItem[] = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, primaryOnMobile: true },
  { to: '/admin/courses', label: 'Courses', icon: BookOpen, primaryOnMobile: true },
  { to: '/admin/students', label: 'Students', icon: Users, primaryOnMobile: true },
  { to: '/admin/registration-window', label: 'Registration Window', icon: CalendarClock },
  {
    to: '/admin/allocation-runs',
    label: 'Allocation Runs',
    shortLabel: 'Allocation',
    icon: ListOrdered,
    primaryOnMobile: true,
  },
  { to: '/admin/waitlists', label: 'Waitlists', icon: Hourglass },
];
