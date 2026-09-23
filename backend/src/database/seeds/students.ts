/**
 * Deterministic student generation. Given the same SeededRandom, produces the
 * same ~300 students every time: varied semesters, credits, completed courses
 * and graduation terms, including clearly ineligible students for some courses.
 */
import { addTerms, parseTerm, type AcademicTerm } from '@course-reg/shared';
import type { EligibilityCourse, EligibilityStudent } from '../../services/eligibilityRules.js';
import type { SeededRandom } from '../../utils/random.js';
import {
  COURSES,
  findCourseSeed,
  PROGRAMS,
  SEED_TERM,
  type CourseSeed,
  type ProgramCode,
  type ProgramSeed,
} from './catalog.js';

export interface CompletedCourseSeed {
  code: string;
  term: AcademicTerm;
}

export interface StudentSeed {
  rollNumber: string;
  name: string;
  email: string;
  programCode: ProgramCode;
  semester: number;
  creditsCompleted: number;
  expectedGraduationTerm: AcademicTerm;
  completedCourses: CompletedCourseSeed[];
}

const FIRST_NAMES = [
  'Aditi',
  'Aditya',
  'Akash',
  'Ananya',
  'Arjun',
  'Bhavya',
  'Chetan',
  'Deepa',
  'Dev',
  'Diya',
  'Farhan',
  'Gauri',
  'Harsh',
  'Ishaan',
  'Isha',
  'Jaya',
  'Kabir',
  'Kavya',
  'Kiran',
  'Lakshmi',
  'Manav',
  'Neha',
  'Nikhil',
  'Nisha',
  'Omkar',
  'Pooja',
  'Rahul',
  'Riya',
  'Sahil',
  'Sana',
  'Siddharth',
  'Sneha',
  'Tanvi',
  'Tarun',
  'Uma',
  'Varun',
  'Vidya',
  'Yash',
  'Zara',
  'Zoya',
];

const LAST_NAMES = [
  'Agarwal',
  'Bose',
  'Chatterjee',
  'Das',
  'Desai',
  'Fernandes',
  'Ghosh',
  'Gupta',
  'Hegde',
  'Iyer',
  'Jain',
  'Joshi',
  'Kapoor',
  'Khan',
  'Kulkarni',
  'Mehta',
  'Menon',
  'Mishra',
  'Nair',
  'Patel',
  'Pillai',
  'Rao',
  'Reddy',
  'Saxena',
  'Sen',
  'Shah',
  'Singh',
  'Thomas',
  'Verma',
  'Yadav',
];

/** Relative frequency of semesters 1..8: skewed towards senior students. */
const SEMESTER_WEIGHTS: Readonly<Record<number, number>> = {
  1: 4,
  2: 6,
  3: 10,
  4: 12,
  5: 18,
  6: 18,
  7: 16,
  8: 16,
};

const CREDITS_PER_SEMESTER = 22;
const EMAIL_DOMAIN = 'university.edu';

/** The term in which a student now in `semester` started semester 1. */
export function entryTermFor(semester: number): AcademicTerm {
  return addTerms(SEED_TERM, -(semester - 1));
}

/** Normal graduation: the term in which the student completes semester 8. */
export function normalGraduationTermFor(semester: number): AcademicTerm {
  return addTerms(SEED_TERM, 8 - semester);
}

/** A course passed in its minimum semester, i.e. that many terms ago. */
export function completionTermFor(semester: number, course: CourseSeed): AcademicTerm {
  return addTerms(SEED_TERM, -(semester - course.minSemester));
}

export function rollNumberFor(program: ProgramSeed, semester: number, sequence: number): string {
  const entryYear = String(parseTerm(entryTermFor(semester)).year % 100).padStart(2, '0');
  return `${program.rollPrefix}${entryYear}${String(sequence).padStart(3, '0')}`;
}

export function emailFor(localPart: string): string {
  return `${localPart.toLowerCase()}@${EMAIL_DOMAIN}`;
}

export function isProgramEligible(course: CourseSeed, programCode: ProgramCode): boolean {
  return course.eligiblePrograms.length === 0 || course.eligiblePrograms.includes(programCode);
}

function pickSemester(random: SeededRandom): number {
  const semesters = Object.keys(SEMESTER_WEIGHTS).map(Number);
  return random.weightedPick(semesters, (semester) => SEMESTER_WEIGHTS[semester] ?? 0);
}

function creditsFor(random: SeededRandom, semester: number): number {
  if (semester === 1) {
    return 0;
  }
  return Math.max(0, (semester - 1) * CREDITS_PER_SEMESTER + random.int(-8, 8));
}

/**
 * Passed courses: a student could have taken a course in an earlier semester
 * if their program allowed it and they had its prerequisites; completionRate
 * decides whether they actually passed it.
 */
function completedCoursesFor(
  random: SeededRandom,
  programCode: ProgramCode,
  semester: number,
): CompletedCourseSeed[] {
  const completed: CompletedCourseSeed[] = [];
  const passed = new Set<string>();

  for (const course of COURSES) {
    const couldHaveTaken =
      course.completionRate > 0 &&
      semester > course.minSemester &&
      isProgramEligible(course, programCode) &&
      course.prerequisites.every((code) => passed.has(code));

    if (couldHaveTaken && random.chance(course.completionRate)) {
      passed.add(course.code);
      completed.push({ code: course.code, term: completionTermFor(semester, course) });
    }
  }
  return completed;
}

function graduationTermFor(random: SeededRandom, semester: number): AcademicTerm {
  // A few senior students must finish this term (accelerated or catching up):
  // they qualify for the graduation-urgency bonus.
  if (semester >= 6 && random.chance(0.12)) {
    return SEED_TERM;
  }
  return normalGraduationTermFor(semester);
}

export function generateStudents(random: SeededRandom): StudentSeed[] {
  return PROGRAMS.flatMap((program) =>
    Array.from({ length: program.generatedStudents }, (_, index): StudentSeed => {
      const semester = pickSemester(random);
      const rollNumber = rollNumberFor(program, semester, index + 1);
      return {
        rollNumber,
        name: `${random.pick(FIRST_NAMES)} ${random.pick(LAST_NAMES)}`,
        email: emailFor(rollNumber),
        programCode: program.code,
        semester,
        creditsCompleted: creditsFor(random, semester),
        expectedGraduationTerm: graduationTermFor(random, semester),
        completedCourses: completedCoursesFor(random, program.code, semester),
      };
    }),
  );
}

/** A seed reference: codes stand in for database ids before the rows exist. */
function seedProgramRef(code: ProgramCode) {
  const program = PROGRAMS.find((candidate) => candidate.code === code);
  return { id: code, code, name: program?.name ?? code };
}

function seedCourseRef(code: string) {
  const course = findCourseSeed(code);
  return { id: code, code, name: course.name };
}

/** Adapts seed data to the eligibility rule, using codes as identifiers. */
export function toEligibilityStudent(student: StudentSeed): EligibilityStudent {
  const { code, name } = seedProgramRef(student.programCode);
  return {
    programId: student.programCode,
    program: { code, name },
    semester: student.semester,
    creditsCompleted: student.creditsCompleted,
    completedCourseIds: new Set(student.completedCourses.map((course) => course.code)),
  };
}

export function toEligibilityCourse(code: string): EligibilityCourse {
  const course = findCourseSeed(code);
  return {
    id: course.code,
    minSemester: course.minSemester,
    minCredits: course.minCredits,
    eligiblePrograms: course.eligiblePrograms.map(seedProgramRef),
    prerequisites: course.prerequisites.map(seedCourseRef),
  };
}
