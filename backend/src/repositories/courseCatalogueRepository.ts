import type { CourseSeats } from '@course-reg/shared';
import type { Pool } from 'pg';
import type { OfferingRecord } from '../types/catalogue.js';
import { mapCatalogueOfferingRow } from './mappers.js';
import type { CatalogueOfferingRow, SeatRow } from './rows.js';

export interface CourseCatalogueRepository {
  /**
   * Every offering in the window (or just `courseCode`) with seats, demand,
   * prerequisites and eligible programs, in ONE query whatever the number of
   * courses. Demand and the rule lists are aggregated in SQL, not per course.
   */
  listOfferings(windowId: string, courseCode?: string): Promise<OfferingRecord[]>;
  /** The live numbers only, for polling. */
  listSeats(windowId: string): Promise<CourseSeats[]>;
  /**
   * Which of `codes` name a real course, so the cart can tell "no such
   * course" from "not offered this term".
   */
  findExistingCodes(codes: readonly string[]): Promise<Set<string>>;
}

/**
 * Demand per course: SUBMITTED preference items in the window. Draft carts are
 * not demand yet. Uses preference_items_window_course_idx.
 */
const DEMAND_CTE = `
  demand AS (
    SELECT pi.course_id, count(*)::int AS demand
    FROM preference_items pi
    JOIN preference_submissions ps ON ps.id = pi.submission_id
    WHERE pi.window_id = $1 AND ps.status = 'SUBMITTED'
    GROUP BY pi.course_id
  )`;

export function createCourseCatalogueRepository(
  pool: Pick<Pool, 'query'>,
): CourseCatalogueRepository {
  return {
    async listOfferings(windowId, courseCode) {
      const result = await pool.query<CatalogueOfferingRow>(
        `WITH ${DEMAND_CTE},
         prerequisites AS (
           SELECT cp.course_id,
                  json_agg(json_build_object('id', p.id, 'code', p.code, 'name', p.name)
                           ORDER BY p.code) AS items
           FROM course_prerequisites cp
           JOIN courses p ON p.id = cp.prerequisite_course_id
           GROUP BY cp.course_id
         ),
         eligible_programs AS (
           SELECT cep.course_id,
                  json_agg(json_build_object('id', pr.id, 'code', pr.code, 'name', pr.name)
                           ORDER BY pr.code) AS items
           FROM course_eligible_programs cep
           JOIN programs pr ON pr.id = cep.program_id
           GROUP BY cep.course_id
         )
         SELECT c.id AS course_id, c.code, c.name, c.credits, c.description,
                c.min_semester, c.min_credits,
                d.code AS department_code, d.name AS department_name,
                rwc.capacity, rwc.allocated_count,
                COALESCE(dm.demand, 0) AS demand,
                COALESCE(pre.items, '[]'::json) AS prerequisites,
                COALESCE(ep.items, '[]'::json) AS eligible_programs
         FROM registration_window_courses rwc
         JOIN courses c ON c.id = rwc.course_id
         JOIN departments d ON d.id = c.department_id
         LEFT JOIN demand dm ON dm.course_id = rwc.course_id
         LEFT JOIN prerequisites pre ON pre.course_id = rwc.course_id
         LEFT JOIN eligible_programs ep ON ep.course_id = rwc.course_id
         WHERE rwc.window_id = $1
           AND ($2::text IS NULL OR c.code = $2)
         ORDER BY c.code`,
        [windowId, courseCode ?? null],
      );
      return result.rows.map(mapCatalogueOfferingRow);
    },

    async findExistingCodes(codes) {
      if (codes.length === 0) {
        return new Set<string>();
      }
      const result = await pool.query<{ code: string }>(
        'SELECT code FROM courses WHERE code = ANY ($1::text[])',
        [[...codes]],
      );
      return new Set(result.rows.map((row) => row.code));
    },

    async listSeats(windowId) {
      const result = await pool.query<SeatRow>(
        `WITH ${DEMAND_CTE}
         SELECT c.code, rwc.capacity, rwc.allocated_count, COALESCE(dm.demand, 0) AS demand
         FROM registration_window_courses rwc
         JOIN courses c ON c.id = rwc.course_id
         LEFT JOIN demand dm ON dm.course_id = rwc.course_id
         WHERE rwc.window_id = $1
         ORDER BY c.code`,
        [windowId],
      );
      return result.rows.map((row) => ({
        code: row.code,
        capacity: row.capacity,
        allocated: row.allocated_count,
        available: row.capacity - row.allocated_count,
        demand: row.demand,
      }));
    },
  };
}
