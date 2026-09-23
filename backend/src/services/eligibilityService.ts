import type {
  CourseEligibility,
  CourseEligibilityDetail,
  EligibilityOverview,
  StudentEligibilityFacts,
} from '@course-reg/shared';
import type { CourseCatalogueRepository } from '../repositories/courseCatalogueRepository.js';
import type { RegistrationWindowRepository } from '../repositories/registrationWindowRepository.js';
import type { StudentRepository } from '../repositories/studentRepository.js';
import type { OfferingRecord } from '../types/catalogue.js';
import { AppError } from '../utils/appError.js';
import { toEligibilityCourse } from './catalogueRules.js';
import { evaluateEligibility, type EligibilityStudent } from './eligibilityRules.js';

export interface EligibilityService {
  /** Every offered course checked against the student, in any window status. */
  getOverview(studentId: string): Promise<EligibilityOverview>;
  getCourse(studentId: string, code: string): Promise<CourseEligibilityDetail>;
}

interface EligibilityServiceDependencies {
  windows: RegistrationWindowRepository;
  catalogue: CourseCatalogueRepository;
  students: StudentRepository;
  now?: () => Date;
}

/** Runs the pure rule and shapes the result for the API. */
export function checkCourse(
  facts: EligibilityStudent,
  offering: OfferingRecord,
): CourseEligibility {
  const result = evaluateEligibility(facts, toEligibilityCourse(offering));
  return {
    code: offering.code,
    name: offering.name,
    credits: offering.credits,
    department: offering.department,
    eligible: result.eligible,
    reasons: result.eligible ? [] : result.reasons,
  };
}

export function createEligibilityService({
  windows,
  catalogue,
  students,
  now = () => new Date(),
}: EligibilityServiceDependencies): EligibilityService {
  /**
   * The student's own facts and passed courses. Always read from the verified
   * session's id, never from anything the client sent.
   */
  async function loadStudent(
    studentId: string,
  ): Promise<{ facts: EligibilityStudent; record: StudentEligibilityFacts }> {
    const [facts, completedCourses] = await Promise.all([
      students.findEligibilityFacts(studentId),
      students.findCompletedCourses(studentId),
    ]);
    if (!facts) {
      throw AppError.notFound('Student profile not found.');
    }
    return {
      facts,
      record: {
        program: facts.program,
        semester: facts.semester,
        creditsCompleted: facts.creditsCompleted,
        completedCourses,
      },
    };
  }

  return {
    async getOverview(studentId) {
      // The pre-check runs before registration opens, so the window's status
      // is irrelevant here: a DRAFT window is exactly the case it exists for.
      const [window, student] = await Promise.all([windows.findCurrent(), loadStudent(studentId)]);
      const offerings = window ? await catalogue.listOfferings(window.id) : [];
      const courses = offerings.map((offering) => checkCourse(student.facts, offering));

      return {
        window: window?.summary ?? null,
        student: student.record,
        summary: {
          eligibleCount: courses.filter((course) => course.eligible).length,
          totalCount: courses.length,
        },
        courses,
        serverTime: now().toISOString(),
      };
    },

    async getCourse(studentId, code) {
      const [window, student] = await Promise.all([windows.findCurrent(), loadStudent(studentId)]);
      const offering = window ? (await catalogue.listOfferings(window.id, code))[0] : undefined;
      if (!offering) {
        throw AppError.notFound(`No course with code ${code} is offered in this window.`);
      }
      return {
        window: window?.summary ?? null,
        student: student.record,
        course: checkCourse(student.facts, offering),
        serverTime: now().toISOString(),
      };
    },
  };
}
