/**
 * Counting up an import.
 *
 * Pure, and shared by the student and the course import, so both report their
 * results in exactly the same shape — which is what lets one screen show the
 * dry run's verdicts and the confirm's outcome.
 */
import type { CsvImportReport, CsvImportRow } from '@course-reg/shared';

/** The rows a judging pass produced, and the ones worth writing. */
export interface ImportOutcome<T> {
  rows: CsvImportRow[];
  accepted: T[];
}

export interface ImportResultFacts {
  applied: boolean;
  imported: number;
  /** Null when the import sends no e-mail (courses) or nothing was written. */
  invitationsSent: number | null;
}

export function summariseImport(
  rows: readonly CsvImportRow[],
  facts: ImportResultFacts,
): CsvImportReport {
  const count = (kind: CsvImportRow['verdict']['kind']): number =>
    rows.filter((row) => row.verdict.kind === kind).length;

  return {
    applied: facts.applied,
    rows: [...rows],
    counts: {
      total: rows.length,
      ok: count('ok'),
      duplicate: count('duplicate'),
      invalid: count('invalid'),
      imported: facts.imported,
    },
    fileError: null,
    invitationsSent: facts.invitationsSent,
  };
}

/**
 * A file that could not be read at all: no rows, and nothing imported. The
 * error names the line, so "you saved this as a spreadsheet" is findable.
 */
export function emptyImportReport(fileError: string): CsvImportReport {
  return {
    applied: false,
    rows: [],
    counts: { total: 0, ok: 0, duplicate: 0, invalid: 0, imported: 0 },
    fileError,
    invitationsSent: null,
  };
}
