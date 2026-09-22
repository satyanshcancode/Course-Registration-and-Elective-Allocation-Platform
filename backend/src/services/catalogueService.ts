import {
  CATALOGUE_PAGE_SIZE,
  type CatalogueCourse,
  type CataloguePage,
  type CatalogueQuery,
  type CourseDetail,
  type CourseSeats,
  type CurrentWindowResponse,
  type SeatSnapshot,
  type StudentCourseContext,
} from '@course-reg/shared';
import { createHash } from 'node:crypto';
import type { CourseCatalogueRepository } from '../repositories/courseCatalogueRepository.js';
import type { RegistrationWindowRepository } from '../repositories/registrationWindowRepository.js';
import type { StudentRepository } from '../repositories/studentRepository.js';
import type { AuthContext } from '../types/auth.js';
import type { CourseStatusRecord, OfferingRecord, WindowRecord } from '../types/catalogue.js';
import { AppError } from '../utils/appError.js';
import {
  compareCourses,
  demandRatio,
  filterOptions,
  groupStatusesByCourse,
  matchesFilters,
  paginate,
  resolveMyStatus,
  shortDescription,
  toCourseEligibility,
  toEligibilityCourse,
} from './catalogueRules.js';
import { evaluateEligibility, type EligibilityStudent } from './eligibilityRules.js';

export interface CatalogueService {
  getCurrentWindow(): Promise<CurrentWindowResponse>;
  /** Personal fields are computed for `viewer` only when it is a student. */
  listCatalogue(viewer: AuthContext, query: CatalogueQuery): Promise<CataloguePage>;
  getCourse(viewer: AuthContext, code: string): Promise<CourseDetail>;
  getSeats(): Promise<SeatSnapshot>;
}

interface CatalogueServiceDependencies {
  windows: RegistrationWindowRepository;
  catalogue: CourseCatalogueRepository;
  students: StudentRepository;
  now?: () => Date;
}

/** What a student needs to personalise any number of courses. */
interface StudentContext {
  facts: EligibilityStudent;
  statuses: Map<string, CourseStatusRecord[]>;
}

const NO_WINDOW_MESSAGE = 'There is no registration window yet.';

export function createCatalogueService({
  windows,
  catalogue,
  students,
  now = () => new Date(),
}: CatalogueServiceDependencies): CatalogueService {
  async function loadStudentContext(
    viewer: AuthContext,
    windowId: string,
  ): Promise<StudentContext | null> {
    if (viewer.role !== 'STUDENT') {
      return null;
    }
    // Always the caller's own id, from the verified session.
    const [facts, statuses] = await Promise.all([
      students.findEligibilityFacts(viewer.studentId),
      students.findCourseStatuses(viewer.studentId, windowId),
    ]);
    if (!facts) {
      throw AppError.notFound('Student profile not found.');
    }
    return { facts, statuses: groupStatusesByCourse(statuses) };
  }

  function personalise(
    offering: OfferingRecord,
    context: StudentContext | null,
  ): StudentCourseContext | null {
    if (!context) {
      return null;
    }
    const result = evaluateEligibility(context.facts, toEligibilityCourse(offering));
    return {
      eligibility: toCourseEligibility(result, offering),
      myStatus: resolveMyStatus(context.statuses.get(offering.courseId) ?? []),
    };
  }

  function toCatalogueCourse(
    offering: OfferingRecord,
    context: StudentContext | null,
  ): CatalogueCourse {
    return {
      code: offering.code,
      name: offering.name,
      credits: offering.credits,
      department: offering.department,
      shortDescription: shortDescription(offering.description),
      capacity: offering.capacity,
      allocated: offering.allocated,
      available: offering.capacity - offering.allocated,
      demand: offering.demand,
      demandRatio: demandRatio(offering.demand, offering.capacity),
      prerequisites: offering.prerequisites.map(({ code, name }) => ({ code, name })),
      eligiblePrograms: offering.eligiblePrograms.map(({ code, name }) => ({ code, name })),
      personal: personalise(offering, context),
    };
  }

  async function requireWindow(): Promise<WindowRecord> {
    const window = await windows.findCurrent();
    if (!window) {
      throw AppError.notFound(NO_WINDOW_MESSAGE);
    }
    return window;
  }

  return {
    async getCurrentWindow() {
      const window = await windows.findCurrent();
      return { window: window?.summary ?? null, serverTime: now().toISOString() };
    },

    async listCatalogue(viewer, query) {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? CATALOGUE_PAGE_SIZE.default;
      const window = await windows.findCurrent();
      if (!window) {
        return {
          window: null,
          items: [],
          page,
          pageSize,
          totalItems: 0,
          totalPages: 1,
          filterOptions: { departments: [], credits: [] },
          serverTime: now().toISOString(),
        };
      }

      // A constant number of queries however many courses there are: all
      // offerings in one, the student's facts in one, their statuses in one.
      const [offerings, context] = await Promise.all([
        catalogue.listOfferings(window.id),
        loadStudentContext(viewer, window.id),
      ]);
      const matching = offerings
        .map((offering) => toCatalogueCourse(offering, context))
        .filter((course) => matchesFilters(course, query))
        .sort(compareCourses(query.sort ?? 'code', query.order));

      return {
        window: window.summary,
        ...paginate(matching, page, pageSize),
        pageSize,
        filterOptions: filterOptions(offerings),
        serverTime: now().toISOString(),
      };
    },

    async getCourse(viewer, code) {
      const window = await requireWindow();
      const [offerings, context] = await Promise.all([
        catalogue.listOfferings(window.id, code),
        loadStudentContext(viewer, window.id),
      ]);
      const offering = offerings[0];
      if (!offering) {
        throw AppError.notFound(
          `No course with code ${code} is offered in ${window.summary.name}.`,
        );
      }
      const course = toCatalogueCourse(offering, context);
      return {
        ...course,
        description: offering.description,
        minSemester: offering.minSemester,
        minCredits: offering.minCredits,
        prerequisites: offering.prerequisites.map(({ id, code: prerequisiteCode, name }) => ({
          code: prerequisiteCode,
          name,
          met: context ? context.facts.completedCourseIds.has(id) : null,
        })),
        window: window.summary,
      };
    },

    async getSeats() {
      const window = await requireWindow();
      const courses = await catalogue.listSeats(window.id);
      return {
        version: seatVersion(window.id, courses),
        serverTime: now().toISOString(),
        courses,
      };
    },
  };
}

/**
 * A short content hash of the seat numbers: identical numbers give the same
 * version (and ETag), and any change to a capacity, seat or request changes it.
 */
export function seatVersion(windowId: string, courses: readonly CourseSeats[]): string {
  return createHash('sha256')
    .update(windowId)
    .update(JSON.stringify(courses))
    .digest('base64url')
    .slice(0, 22);
}
