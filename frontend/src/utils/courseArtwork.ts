/**
 * The header artwork every catalogue card wears.
 *
 * It is generated, not photographed: an abstract motif drawn from the course's
 * own department code and code, so there is no image to licence, credit, host
 * or hotlink, and a course looks the same wherever it appears. Pure, so the
 * choices are tested rather than eyeballed.
 */

export const ARTWORK_MOTIFS = ['grid', 'arcs', 'bars', 'rings'] as const;
export type ArtworkMotif = (typeof ARTWORK_MOTIFS)[number];

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

/** How far either side of its department a course's hue may wander. */
export const HUE_SPREAD = 20;

/**
 * The hue angle a course is drawn in, in degrees.
 *
 * The department sets the centre, so the catalogue reads as departments at a
 * glance; the course shifts it by up to HUE_SPREAD either way, so a page of
 * one department is a family rather than the same picture twelve times. Only
 * the ANGLE comes from the data: saturation and lightness are set in the
 * stylesheet, which is what keeps the artwork inside the theme in both light
 * and dark.
 */
export function hueFor(departmentCode: string, courseCode: string): number {
  const centre = hashCode(departmentCode.toUpperCase()) % 360;
  const shift = (hashCode(courseCode.toUpperCase()) % (HUE_SPREAD * 2 + 1)) - HUE_SPREAD;
  return (centre + shift + 360) % 360;
}

/** Which motif a course is drawn with; stable for a given code. */
export function motifForCourse(code: string): ArtworkMotif {
  const motif = ARTWORK_MOTIFS[hashCode(code.toUpperCase()) % ARTWORK_MOTIFS.length];
  // ARTWORK_MOTIFS is never empty and the modulus is in range, so this only
  // satisfies noUncheckedIndexedAccess.
  return motif ?? 'grid';
}
