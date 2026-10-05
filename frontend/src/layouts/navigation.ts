import {
  ArrowLeftRight,
  BadgeCheck,
  Bell,
  BookOpen,
  CalendarClock,
  History,
  Hourglass,
  LayoutDashboard,
  ListChecks,
  ListOrdered,
  Library,
  ShieldCheck,
  ShoppingCart,
  Users,
  type LucideIcon,
} from 'lucide-react';

/** A count beside a nav item: the number, what it counts, and how loudly. */
export interface NavBadge {
  count: number;
  /** Read after the number by assistive technology, e.g. "courses ranked". */
  label: string;
  /** `danger` is for a count that wants reading now; the default is quiet. */
  tone?: 'neutral' | 'danger';
}

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
];

export const ADMIN_NAV: readonly NavItem[] = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, primaryOnMobile: true },
  { to: '/admin/courses', label: 'Courses', icon: BookOpen, primaryOnMobile: true },
  {
    to: '/admin/course-catalogue',
    label: 'Course Catalogue',
    shortLabel: 'Catalogue',
    icon: Library,
  },
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

/**
 * Staff accounts: an ADMIN only. A co-administrator does everything else on
 * this list, so the Team item is the single visible difference between the two
 * roles. Hiding it is a courtesy; `/api/admin/team` refuses them regardless.
 */
export const TEAM_NAV_ITEM: NavItem = {
  to: '/admin/team',
  label: 'Team',
  icon: ShieldCheck,
};

export function adminNavFor(canManageStaff: boolean): readonly NavItem[] {
  return canManageStaff ? [...ADMIN_NAV, TEAM_NAV_ITEM] : ADMIN_NAV;
}
