/**
 * The header photograph every catalogue card wears.
 *
 * Seventeen dark, wide photographs live in `frontend/public/course-photos`.
 * They are CC0, downloaded once and served from this repository — never
 * hotlinked — and credited in the README. A course picks one by hashing its
 * own code, so the same course always wears the same photograph and three
 * neighbouring cards in a row almost never repeat. Pure, so the choice is
 * tested rather than eyeballed.
 */

/** The files in `public/course-photos`, in the order the hash indexes them. */
export const COURSE_PHOTOS = [
  'data-hall',
  'blue-racks',
  'rack-corridor',
  'machine-room',
  'circuit-board',
  'harbour-night',
  'skyline-water',
  'lit-facade',
  'glass-atrium',
  'river-crossing',
  'bridge-lights',
  'suspension-span',
  'patch-panel',
  'cable-bundle',
  'switch-stack',
  'city-dusk',
  'waterfront',
] as const;

export type CoursePhoto = (typeof COURSE_PHOTOS)[number];

/**
 * A small, stable hash of a string. FNV-1a over UTF-16 code units, kept inside
 * 32 bits with `Math.imul` so it cannot drift into float territory.
 */
export function hashCode(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Which photograph a course wears; stable for a given code. */
export function photoForCourse(code: string): CoursePhoto {
  const photo = COURSE_PHOTOS[hashCode(code.toUpperCase()) % COURSE_PHOTOS.length];
  // COURSE_PHOTOS is never empty and the modulus is in range, so this only
  // satisfies noUncheckedIndexedAccess.
  return photo ?? 'data-hall';
}

/** Where that photograph is served from. */
export function photoUrlFor(code: string): string {
  return `/course-photos/${photoForCourse(code)}.jpg`;
}
