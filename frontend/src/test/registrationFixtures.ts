import {
  DEFAULT_PREFERENCE_PRIORITY_CONFIG,
  type AdminWaitlistView,
  type AdminWindowDetail,
  type AllocationMetrics,
  type AllocationPreview,
  type AllocationRunDetail,
  type CartItem,
  type CourseEligibility,
  type EligibilityOverview,
  type PreferenceCart,
  type PreferenceRank,
  type PromotionSummary,
  type StudentAllocationResults,
  type StudentWaitlist,
  type StudentWaitlistEntry,
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

export function allocationMetrics(overrides: Partial<AllocationMetrics> = {}): AllocationMetrics {
  return {
    students: 150,
    allocated: 142,
    unallocated: 8,
    firstChoiceRate: 0.43,
    topThreeRate: 0.93,
    averageAllocatedRank: 1.63,
    seatsOffered: 865,
    seatsFilled: 142,
    seatUtilisation: 0.16,
    waitlistEntries: 101,
    justifiedEnvy: 0,
    runtimeMs: 15,
    courses: [
      {
        course: { code: 'CS401', name: 'Artificial Intelligence' },
        capacity: 20,
        applicants: 116,
        allocated: 20,
        waitlisted: 85,
        cutoffScore: 185,
        oversubscribed: true,
      },
      {
        course: { code: 'EC302', name: 'VLSI Design' },
        capacity: 30,
        applicants: 18,
        allocated: 0,
        waitlisted: 0,
        cutoffScore: null,
        oversubscribed: false,
      },
    ],
    ...overrides,
  };
}

/** FCFS looks close on the headline rates and terrible on justified envy. */
export const allocationPreview: AllocationPreview = {
  window: { ...fallWindow, status: 'CLOSED' },
  submissions: 150,
  randomSeed: 2026091801,
  methods: [
    {
      method: 'FCFS',
      algorithmVersion: 'fcfs-1.0.0',
      willBeUsed: false,
      metrics: allocationMetrics({
        allocated: 140,
        unallocated: 10,
        averageAllocatedRank: 1.61,
        justifiedEnvy: 78,
        seatsFilled: 140,
        waitlistEntries: 96,
        runtimeMs: 9,
      }),
    },
    {
      method: 'PREFERENCE_PRIORITY',
      algorithmVersion: 'deferred-acceptance-1.0.0',
      willBeUsed: true,
      metrics: allocationMetrics(),
    },
  ],
  serverTime: SERVER_TIME,
};

export function allocationRun(overrides: Partial<AllocationRunDetail> = {}): AllocationRunDetail {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    method: 'PREFERENCE_PRIORITY',
    algorithmVersion: 'deferred-acceptance-1.0.0',
    status: 'COMPLETED',
    startedAt: '2026-09-25T10:43:03.000Z',
    finishedAt: '2026-09-25T10:43:03.600Z',
    errorMessage: null,
    metrics: allocationMetrics(),
    triggeredBy: null,
    window: { ...fallWindow, status: 'ALLOCATED' },
    randomSeed: 2026091801,
    config: DEFAULT_PREFERENCE_PRIORITY_CONFIG,
    outputHash: 'b064a17bf12abef3c05d2b39f7aa2cddc6a39b14c023412dd33718abe5381287',
    inputSize: { students: 150, courses: 20 },
    ...overrides,
  };
}

const aiFacts = {
  course: { code: 'CS401', name: 'Artificial Intelligence' },
  preferenceRank: 1 as const,
  score: {
    preferenceRank: 1 as const,
    preferencePoints: 100,
    bonuses: [{ type: 'FINAL_YEAR' as const, points: 20 }],
    priorityPoints: 20,
    total: 120,
  },
  finalRank: 27,
  capacity: 20,
  applicants: 116,
  cutoffScore: 185,
};

export const studentResults: StudentAllocationResults = {
  window: { ...fallWindow, status: 'ALLOCATED' },
  ranAt: '2026-09-25T10:43:03.600Z',
  method: 'PREFERENCE_PRIORITY',
  allocated: {
    type: 'ALLOCATED',
    ...aiFacts,
    course: { code: 'CS402', name: 'Cloud Security' },
    preferenceRank: 2,
    finalRank: 17,
    capacity: 30,
    applicants: 77,
    cutoffScore: 80,
  },
  results: [
    { outcome: 'WAITLISTED', explanation: { type: 'WAITLISTED', waitlistPosition: 7, ...aiFacts } },
    {
      outcome: 'ALLOCATED',
      explanation: {
        type: 'ALLOCATED',
        ...aiFacts,
        course: { code: 'CS402', name: 'Cloud Security' },
        preferenceRank: 2,
        finalRank: 17,
        capacity: 30,
        applicants: 77,
        cutoffScore: 80,
      },
    },
  ],
  serverTime: SERVER_TIME,
};

/** Before allocation has run: the window exists, the result does not. */
export const pendingResults: StudentAllocationResults = {
  window: fallWindow,
  ranAt: null,
  method: null,
  allocated: null,
  results: [],
  serverTime: SERVER_TIME,
};

// ---------------------------------------------------------------------------
// Waitlists (Phase 9)
// ---------------------------------------------------------------------------

export function waitlistEntry(overrides: Partial<StudentWaitlistEntry> = {}): StudentWaitlistEntry {
  return {
    course: { code: 'CS401', name: 'Artificial Intelligence' },
    preferenceRank: 1,
    status: 'WAITING',
    position: 3,
    waiting: 18,
    capacity: 20,
    allocated: 20,
    score: 120,
    reason: null,
    endedAt: null,
    ...overrides,
  };
}

/** Waiting for their first choice while holding their second. */
export const studentWaitlist: StudentWaitlist = {
  window: { ...fallWindow, status: 'ALLOCATED' },
  held: { course: { code: 'CS402', name: 'Cloud Security' }, rank: 2 },
  waiting: [waitlistEntry()],
  ended: [],
  serverTime: SERVER_TIME,
};

export const emptyWaitlist: StudentWaitlist = {
  window: { ...fallWindow, status: 'ALLOCATED' },
  held: null,
  waiting: [],
  ended: [],
  serverTime: SERVER_TIME,
};

export function adminWaitlistView(overrides: Partial<AdminWaitlistView> = {}): AdminWaitlistView {
  return {
    window: { ...fallWindow, status: 'ALLOCATED' },
    courses: [
      { code: 'CS401', name: 'Artificial Intelligence' },
      { code: 'CS402', name: 'Cloud Security' },
    ],
    course: {
      code: 'CS401',
      name: 'Artificial Intelligence',
      capacity: 20,
      allocated: 20,
      available: 0,
    },
    enrolled: [
      {
        enrollmentId: 'enrollment-1',
        student: { name: 'Ada Iyer', email: 'ada@university.edu', program: 'CSE', semester: 7 },
        source: 'ALLOCATION',
        preferenceRank: 1,
        enrolledAt: SERVER_TIME,
      },
    ],
    waitlist: [
      {
        student: { name: 'Bo Nair', email: 'bo@university.edu', program: 'CSE', semester: 5 },
        status: 'WAITING',
        position: 1,
        storedPosition: 4,
        score: 120,
        preferenceRank: 1,
        reason: null,
      },
    ],
    serverTime: SERVER_TIME,
    ...overrides,
  };
}

export const promotionSummary: PromotionSummary = {
  promoted: [
    {
      student: { name: 'Bo Nair', email: 'bo@university.edu', program: 'CSE', semester: 5 },
      course: { code: 'CS401', name: 'Artificial Intelligence' },
      fromCourse: { code: 'CS403', name: 'Blockchain' },
    },
  ],
  removed: [],
};
