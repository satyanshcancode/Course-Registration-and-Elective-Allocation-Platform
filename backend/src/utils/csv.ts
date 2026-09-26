/**
 * A small RFC 4180 CSV reader.
 *
 * Written rather than installed: the files this accepts are a header plus a
 * handful of plain columns, and the whole format is the four rules below. A
 * dependency for that would be more surface than code.
 *
 *   * fields are separated by commas, records by LF or CRLF;
 *   * a field may be wrapped in double quotes, and then may contain commas and
 *     newlines;
 *   * inside a quoted field, "" is a literal quote;
 *   * anything else is taken literally.
 *
 * It is pure and total: every input produces rows or a `CsvParseError`, never a
 * partial read.
 */

export class CsvParseError extends Error {
  /** 1-based line the problem was found on. */
  readonly line: number;

  constructor(message: string, line: number) {
    super(message);
    this.name = 'CsvParseError';
    this.line = line;
  }
}

/** Zero-width no-break space some spreadsheets put at the start of a file. */
const BYTE_ORDER_MARK = '﻿';

/**
 * Splits CSV text into rows of raw cells. Blank lines are dropped: a trailing
 * newline is normal, and a stray empty line in the middle of a pasted file is
 * not worth an error.
 */
export function parseCsv(text: string): string[][] {
  const input = text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let index = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    // One empty cell is an empty line, not a record.
    if (row.length > 1 || row[0] !== '') {
      rows.push(row);
    }
    row = [];
  };

  while (index < input.length) {
    const char = input[index] ?? '';

    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      if (char === '\n') {
        line += 1;
      }
      field += char;
      index += 1;
      continue;
    }

    switch (char) {
      case '"':
        // A quote only opens a field at its very start; elsewhere it is literal,
        // which is what a hand-edited file usually means by it.
        if (field === '') {
          quoted = true;
        } else {
          field += char;
        }
        index += 1;
        break;
      case ',':
        endField();
        index += 1;
        break;
      case '\r':
        // CRLF and a lone CR both end the record.
        endRow();
        line += 1;
        index += input[index + 1] === '\n' ? 2 : 1;
        break;
      case '\n':
        endRow();
        line += 1;
        index += 1;
        break;
      default:
        field += char;
        index += 1;
    }
  }

  if (quoted) {
    throw new CsvParseError('A quoted value is never closed (check the double quotes).', line);
  }
  // Whatever is left is the last record, unless the file ended with a newline.
  if (field !== '' || row.length > 0) {
    endRow();
  }
  return rows;
}

export interface CsvTable {
  /** The header cells, trimmed, in file order. */
  columns: string[];
  /** One record per row: column name to trimmed value. */
  records: { line: number; values: Record<string, string> }[];
}

/**
 * Reads CSV text as a table with the given columns.
 *
 * The header must name every expected column (order does not matter, extra
 * columns are ignored), because silently importing a file whose columns were
 * rearranged is how a roll number ends up in the name column.
 */
export function readCsvTable(text: string, expected: readonly string[]): CsvTable {
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header) {
    throw new CsvParseError('The file is empty.', 1);
  }

  const columns = header.map((cell) => cell.trim());
  const missing = expected.filter((column) => !columns.includes(column));
  if (missing.length > 0) {
    throw new CsvParseError(
      `The header row is missing ${missing.length === 1 ? 'the column' : 'the columns'} ${missing.join(', ')}. Expected: ${expected.join(', ')}.`,
      1,
    );
  }

  const records = rows.slice(1).map((cells, index) => {
    const values: Record<string, string> = {};
    for (const [position, column] of columns.entries()) {
      values[column] = (cells[position] ?? '').trim();
    }
    // 1-based, header excluded: the number the preview shows next to the row.
    return { line: index + 1, values };
  });

  return { columns, records };
}

/** A space- or comma-separated list inside one cell, e.g. "CS201 CS202". */
export function readCsvList(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
