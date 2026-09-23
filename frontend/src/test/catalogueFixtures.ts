import type {
  AdminCourseOffering,
  ApiResponse,
  CatalogueCourse,
  CataloguePage,
  CourseDetail,
  CurrentWindowResponse,
  RegistrationWindowSummary,
  SeatSnapshot,
} from '@course-reg/shared';

export const SERVER_TIME = '2026-09-22T09:00:00.000Z';

export const fallWindow: RegistrationWindowSummary = {
  name: 'Fall 2026',
  term: '2026-FALL',
  status: 'OPEN',
  startsAt: '2026-09-21T04:30:00.000Z',
  endsAt: '2026-10-13T11:30:00.000Z',
};

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export function makeCourse(overrides: Partial<CatalogueCourse> = {}): CatalogueCourse {
  return {
    code: 'CS401',
    name: 'Artificial Intelligence',
    credits: 4,
    department: { code: 'CSE', name: 'Computer Science and Engineering' },
    shortDescription: 'Search, knowledge representation and planning.',
    capacity: 20,
    allocated: 0,
    available: 20,
    demand: 114,
    demandRatio: 5.7,
    prerequisites: [
      { code: 'CS201', name: 'Data Structures and Algorithms' },
      { code: 'MA201', name: 'Probability and Statistics' },
    ],
    eligiblePrograms: [{ code: 'BTECH-CSE', name: 'B.Tech Computer Science and Engineering' }],
    personal: {
      eligibility: { eligible: true },
      myStatus: { code: 'SUBMITTED', rank: 1 },
    },
    ...overrides,
  };
}

export const catalogueCourses: CatalogueCourse[] = [
  makeCourse(),
  makeCourse({
    code: 'CS402',
    name: 'Cloud Security',
    capacity: 30,
    available: 30,
    demand: 71,
    demandRatio: 2.37,
    prerequisites: [{ code: 'CS302', name: 'Computer Networks' }],
    personal: {
      eligibility: {
        eligible: false,
        reasons: [{ type: 'SEMESTER_TOO_LOW', required: 7, actual: 6 }],
      },
      myStatus: { code: 'NOT_SELECTED' },
    },
  }),
  makeCourse({
    code: 'ME302',
    name: 'Renewable Energy Systems',
    credits: 3,
    department: { code: 'ME', name: 'Mechanical Engineering' },
    capacity: 40,
    allocated: 38,
    available: 2,
    demand: 12,
    demandRatio: 0.3,
    prerequisites: [],
    personal: { eligibility: { eligible: true }, myStatus: { code: 'WAITLISTED', position: 7 } },
  }),
];

export function cataloguePage(
  items: CatalogueCourse[] = catalogueCourses,
  overrides: Partial<CataloguePage> = {},
): CataloguePage {
  return {
    window: fallWindow,
    items,
    page: 1,
    pageSize: 12,
    totalItems: items.length,
    totalPages: 1,
    filterOptions: {
      departments: [
        { code: 'CSE', name: 'Computer Science and Engineering' },
        { code: 'ME', name: 'Mechanical Engineering' },
      ],
      credits: [3, 4],
    },
    serverTime: SERVER_TIME,
    ...overrides,
  };
}

export const currentWindow: CurrentWindowResponse = { window: fallWindow, serverTime: SERVER_TIME };

/** A seat snapshot matching `courses`, optionally with some numbers changed. */
export function seatSnapshot(
  courses: CatalogueCourse[] = catalogueCourses,
  changes: Record<string, { allocated: number }> = {},
  serverTime = '2026-09-22T09:00:05.000Z',
): SeatSnapshot {
  return {
    version: `v-${JSON.stringify(changes)}`,
    serverTime,
    courses: courses.map((course) => {
      const allocated = changes[course.code]?.allocated ?? course.allocated;
      return {
        code: course.code,
        capacity: course.capacity,
        allocated,
        available: course.capacity - allocated,
        demand: course.demand,
      };
    }),
  };
}

export function courseDetail(overrides: Partial<CourseDetail> = {}): CourseDetail {
  return {
    ...makeCourse(),
    description:
      'Search, knowledge representation and planning. Assessed through four programming assignments.',
    minSemester: 5,
    minCredits: 80,
    prerequisites: [
      { code: 'CS201', name: 'Data Structures and Algorithms', met: true },
      { code: 'MA201', name: 'Probability and Statistics', met: false },
    ],
    window: fallWindow,
    serverTime: SERVER_TIME,
    ...overrides,
  };
}

export function adminOffering(overrides: Partial<AdminCourseOffering> = {}): AdminCourseOffering {
  return {
    code: 'CS401',
    name: 'Artificial Intelligence',
    credits: 4,
    department: { code: 'CSE', name: 'Computer Science and Engineering' },
    capacity: 20,
    allocated: 12,
    available: 8,
    demand: 114,
    demandRatio: 5.7,
    oversubscribed: true,
    ...overrides,
  };
}
