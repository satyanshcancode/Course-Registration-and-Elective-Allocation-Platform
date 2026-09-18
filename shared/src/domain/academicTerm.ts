import { TERM_SEASONS, type TermSeason } from './enums.js';

/** An academic term such as "2026-FALL". Spring precedes fall within a year. */
export type AcademicTerm = `${number}-${TermSeason}`;

const TERM_PATTERN = /^(\d{4})-(SPRING|FALL)$/;

export interface ParsedTerm {
  year: number;
  season: TermSeason;
}

export function isAcademicTerm(value: unknown): value is AcademicTerm {
  return typeof value === 'string' && TERM_PATTERN.test(value);
}

export function parseTerm(term: AcademicTerm): ParsedTerm {
  const match = TERM_PATTERN.exec(term);
  const year = match?.[1];
  const season = match?.[2];
  if (year === undefined || (season !== 'SPRING' && season !== 'FALL')) {
    throw new Error(`Invalid academic term "${term}"`);
  }
  return { year: Number(year), season };
}

export function formatTerm({ year, season }: ParsedTerm): AcademicTerm {
  return `${year}-${season}`;
}

/** Chronological index: consecutive terms differ by exactly 1. */
function termIndex(term: AcademicTerm): number {
  const { year, season } = parseTerm(term);
  return year * TERM_SEASONS.length + TERM_SEASONS.indexOf(season);
}

/** Negative if a is earlier than b, 0 if equal, positive if later. */
export function compareTerms(a: AcademicTerm, b: AcademicTerm): number {
  return termIndex(a) - termIndex(b);
}

/** Moves a term forwards (positive offset) or backwards by whole terms. */
export function addTerms(term: AcademicTerm, offset: number): AcademicTerm {
  const index = termIndex(term) + offset;
  const season = TERM_SEASONS[index % TERM_SEASONS.length];
  if (season === undefined) {
    throw new Error(`Cannot offset term "${term}" by ${offset}`);
  }
  return formatTerm({ year: Math.floor(index / TERM_SEASONS.length), season });
}
