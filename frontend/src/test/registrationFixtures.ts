import {
  DEFAULT_PREFERENCE_PRIORITY_CONFIG,
  type AdminWindowDetail,
  type CartItem,
  type CourseEligibility,
  type EligibilityOverview,
  type PreferenceCart,
  type PreferenceRank,
  type SubmissionReceipt,
  type WindowCourseOption,
} from '@course-reg/shared';
import { fallWindow, SERVER_TIME } from './catalogueFixtures';

export function eligibleCourse(overrides: Partial<CourseEligibility> = {}): CourseEligibility {
  return {
    code: 'CS401',
    name: 'Artificial Intelligence',
    credits: 4,
    department: { code: 'CSE', name: 'Computer Science and Engineering' },
    eligible: true,
    reasons: [],
    ...overrides,
  };
}

export const eligibilityOverview: EligibilityOverview = {
  window: { ...fallWindow, status: 'DRAFT' },
  student: {
    program: { code: 'BTECH-ME', name: 'B.Tech Mechanical Engineering' },
    semester: 3,
    creditsCompleted: 44,
    completedCourses: [{ code: 'CS101', name: 'Programming Fundamentals' }],
  },
  summary: { eligibleCount: 1, totalCount: 3 },
  courses: [
    eligibleCourse({
      code: 'ME302',
      name: 'Renewable Energy Systems',
      credits: 3,
      department: { code: 'ME', name: 'Mechanical Engineering' },
    }),
    eligibleCourse({
      eligible: false,
      reasons: [
        {
          type: 'PROGRAM_NOT_ALLOWED',
          program: { code: 'BTECH-ME', name: 'B.Tech Mechanical Engineering' },
          allowedPrograms: [{ code: 'CSE', name: 'Computer Science' }],
        },
        { type: 'SEMESTER_TOO_LOW', required: 5, actual: 3 },
      ],
    }),
    eligibleCourse({
      code: 'CS402',
      name: 'Cloud Security',
      eligible: false,
      reasons: [
        { type: 'PREREQUISITE_MISSING', course: { code: 'CS302', name: 'Computer Networks' } },
      ],
    }),
  ],
  serverTime: SERVER_TIME,
};

export function windowCourse(overrides: Partial<WindowCourseOption> = {}): WindowCourseOption {
  return {
    code: 'CS401',
    name: 'Artificial Intelligence',
    credits: 4,
    department: { code: 'CSE', name: 'Computer Science and Engineering' },
    offered: true,
    capacity: 20,
    demand: 114,
    ...overrides,
  };
}

export function adminWindow(overrides: Partial<AdminWindowDetail> = {}): AdminWindowDetail {
  return {
    window: { ...fallWindow, status: 'DRAFT' },
    policy: DEFAULT_PREFERENCE_PRIORITY_CONFIG,
    randomSeed: 2026091801,
    editable: true,
    counts: {
      offeredCourses: 2,
      eligibleStudents: 118,
      submissions: 0,
      totalStudents: 300,
    },
    courses: [
      windowCourse(),
      windowCourse({ code: 'CS402', name: 'Cloud Security', capacity: 30, demand: 71 }),
      windowCourse({
        code: 'ME302',
        name: 'Renewable Energy',
        offered: false,
        capacity: null,
        demand: 0,
      }),
    ],
    serverTime: SERVER_TIME,
    ...overrides,
  };
}

export function cartItem(rank: PreferenceRank, overrides: Partial<CartItem> = {}): CartItem {
  return {
    rank,
    code: 'CS401',
    name: 'Artificial Intelligence',
    credits: 4,
    department: { code: 'CSE', name: 'Computer Science and Engineering' },
    capacity: 20,
    allocated: 0,
    available: 20,
    demand: 114,
    demandRatio: 5.7,
    eligibility: { eligible: true },
    ...overrides,
  };
}

/** Three ranked courses in an open window, nothing submitted yet. */
export function draftCart(overrides: Partial<PreferenceCart> = {}): PreferenceCart {
  const items = [
    cartItem(1),
    cartItem(2, { code: 'CS402', name: 'Cloud Security', credits: 3, capacity: 30, available: 30 }),
    cartItem(3, { code: 'CS403', name: 'Distributed Systems', credits: 4 }),
  ];
  return {
    window: fallWindow,
    status: 'DRAFT',
    items,
    submittedAt: null,
    sequence: null,
    reference: null,
    editable: true,
    submittable: true,
    submitBlockedReason: null,
    totalCredits: items.reduce((total, item) => total + item.credits, 0),
    serverTime: SERVER_TIME,
    ...overrides,
  };
}

export function submittedCart(overrides: Partial<PreferenceCart> = {}): PreferenceCart {
  return draftCart({
    status: 'SUBMITTED',
    submittedAt: '2026-09-22T08:55:00.000Z',
    sequence: 128,
    reference: 'REF-3F9A2C71',
    editable: false,
    submittable: false,
    submitBlockedReason: 'You have already submitted your preferences.',
    ...overrides,
  });
}

export function receiptFor(cart: PreferenceCart): SubmissionReceipt {
  return {
    window: fallWindow,
    reference: cart.reference ?? 'REF-3F9A2C71',
    submittedAt: cart.submittedAt ?? '2026-09-22T08:55:00.000Z',
    sequence: cart.sequence ?? 128,
    items: cart.items,
    totalCredits: cart.totalCredits,
    serverTime: SERVER_TIME,
  };
}
