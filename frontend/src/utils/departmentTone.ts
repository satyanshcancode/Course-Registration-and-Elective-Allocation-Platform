/**
 * Which of the five spine colours a department gets in the catalogue.
 *
 * Presentation only: the department's name is always printed beside the spine,
 * so the colour is a second way to scan a long list, never the only one. The
 * tone is derived from the code rather than configured, so a department added
 * to the seed needs no change here — and derived with a stable hash rather than
 * list position, so adding one does not recolour the others.
 */
export const DEPARTMENT_TONES = ['a', 'b', 'c', 'd', 'e'] as const;

export type DepartmentTone = (typeof DEPARTMENT_TONES)[number];

export function departmentTone(code: string): DepartmentTone {
  let hash = 0;
  for (const character of code.toUpperCase()) {
    // djb2, kept small: the only requirement is that it is stable and spreads.
    hash = (hash * 33 + character.charCodeAt(0)) % 100_000;
  }
  return DEPARTMENT_TONES[hash % DEPARTMENT_TONES.length] ?? 'a';
}
