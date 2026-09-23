import {
  DEFAULT_PREFERENCE_PRIORITY_CONFIG,
  type AdminWindowDetail,
  type CourseEligibility,
  type EligibilityOverview,
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
