/**
 * Named demo accounts, each showing a different situation.
 *
 * DEMO-ONLY CREDENTIALS. These passwords are published in the README so the
 * app can be demonstrated; never reuse them anywhere real.
 */
import { findCourseSeed, PROGRAMS, SEED_TERM, type ProgramCode } from './catalog.js';
import {
  completionTermFor,
  emailFor,
  normalGraduationTermFor,
  rollNumberFor,
  type StudentSeed,
} from './students.js';

export const DEMO_ADMIN_PASSWORD = 'Admin@123';
export const DEMO_STUDENT_PASSWORD = 'Student@123';
export const ADMIN_EMAIL = 'admin@university.edu';

interface DemoStudentSpec {
  localPart: string;
  name: string;
  programCode: ProgramCode;
  semester: number;
  creditsCompleted: number;
  completedCourseCodes: string[];
  /** Defaults to normal graduation after semester 8. */
  graduatesThisTerm?: boolean;
  /** Roll-number sequence; 9xx keeps clear of generated students. */
  sequence: number;
  /** Fixed preferences for `npm run seed:demo-submissions`. */
  preferences: string[];
  situation: string;
}

const DEMO_STUDENT_SPECS: readonly DemoStudentSpec[] = [
  {
    localPart: 'aarav.sharma',
    name: 'Aarav Sharma',
    programCode: 'BTECH-CSE',
    semester: 6,
    creditsCompleted: 112,
    completedCourseCodes: ['MA201', 'MA202', 'CS201', 'CS202', 'CS301', 'CS302'],
    sequence: 901,
    preferences: ['CS401', 'CS402', 'CS403', 'CS404'],
    situation: 'Eligible for Artificial Intelligence (program relevance bonus only)',
  },
  {
    localPart: 'meera.iyer',
    name: 'Meera Iyer',
    programCode: 'BTECH-ME',
    semester: 3,
    creditsCompleted: 44,
    completedCourseCodes: ['MA201', 'MA202'],
    sequence: 902,
    preferences: ['MG301'],
    situation:
      'Not eligible for Artificial Intelligence (program, semester, credits and prerequisite)',
  },
  {
    localPart: 'rohan.verma',
    name: 'Rohan Verma',
    programCode: 'BTECH-CSE',
    semester: 8,
    creditsCompleted: 158,
    completedCourseCodes: ['MA201', 'MA202', 'CS201', 'CS202', 'CS301', 'CS302'],
    graduatesThisTerm: true,
    sequence: 903,
    preferences: ['CS401', 'CS403', 'CS402', 'CS405'],
    situation: 'Final year, graduating this term: highest priority (+20 +25 +40)',
  },
  {
    localPart: 'priya.nair',
    name: 'Priya Nair',
    programCode: 'BTECH-ECE',
    semester: 5,
    creditsCompleted: 88,
    completedCourseCodes: ['MA201', 'CS201', 'CS302'],
    sequence: 904,
    preferences: ['CS401', 'CS402', 'CS404', 'EC401'],
    situation: 'Eligible for Artificial Intelligence but no priority bonus',
  },
];

export interface DemoStudent extends StudentSeed {
  preferences: string[];
  situation: string;
}

function programSeed(code: ProgramCode) {
  const program = PROGRAMS.find((candidate) => candidate.code === code);
  if (!program) {
    throw new Error(`Unknown program ${code}`);
  }
  return program;
}

export const DEMO_STUDENTS: readonly DemoStudent[] = DEMO_STUDENT_SPECS.map((spec) => ({
  rollNumber: rollNumberFor(programSeed(spec.programCode), spec.semester, spec.sequence),
  name: spec.name,
  email: emailFor(spec.localPart),
  programCode: spec.programCode,
  semester: spec.semester,
  creditsCompleted: spec.creditsCompleted,
  expectedGraduationTerm: spec.graduatesThisTerm
    ? SEED_TERM
    : normalGraduationTermFor(spec.semester),
  completedCourses: spec.completedCourseCodes.map((code) => ({
    code,
    term: completionTermFor(spec.semester, findCourseSeed(code)),
  })),
  preferences: spec.preferences,
  situation: spec.situation,
}));
