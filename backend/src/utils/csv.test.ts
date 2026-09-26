import { buildCsvTemplate, STUDENT_CSV_COLUMNS, STUDENT_CSV_EXAMPLE } from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import { CsvParseError, parseCsv, readCsvList, readCsvTable } from './csv.js';

describe('parseCsv', () => {
  it('reads plain rows', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('accepts CRLF, a lone CR and a missing final newline', () => {
    expect(parseCsv('a,b\r\n1,2\r3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('keeps commas, newlines and doubled quotes inside a quoted field', () => {
    expect(parseCsv('name,note\n"Doe, Jane","said ""hi""\nthen left"')).toEqual([
      ['name', 'note'],
      ['Doe, Jane', 'said "hi"\nthen left'],
    ]);
  });

  it('drops blank lines but keeps a row of empty cells', () => {
    expect(parseCsv('a,b\n\n1,2\n,\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['', ''],
    ]);
  });

  it('strips a byte order mark so the first column name still matches', () => {
    expect(parseCsv('﻿code,name\nCS401,AI')[0]).toEqual(['code', 'name']);
  });

  it('treats a quote inside an unquoted field as a literal character', () => {
    expect(parseCsv('a\n5" pipe')).toEqual([['a'], ['5" pipe']]);
  });

  it('reports the line of an unclosed quote instead of guessing', () => {
    expect(() => parseCsv('a,b\n"open,2\n3,4')).toThrow(CsvParseError);
    try {
      parseCsv('a,b\n"open,2\n3,4');
    } catch (error) {
      expect(error).toMatchObject({ line: 3 });
    }
  });
});

describe('readCsvTable', () => {
  const columns = ['code', 'name'] as const;

  it('maps each record by column name and numbers rows from 1, header excluded', () => {
    const table = readCsvTable('code,name\nCS401, Artificial Intelligence \n', columns);
    expect(table.records).toEqual([
      { line: 1, values: { code: 'CS401', name: 'Artificial Intelligence' } },
    ]);
  });

  it('ignores column order and extra columns', () => {
    const table = readCsvTable('name,extra,code\nAI,ignored,CS401', columns);
    expect(table.records[0]?.values).toEqual({ name: 'AI', extra: 'ignored', code: 'CS401' });
  });

  it('refuses a header that is missing an expected column, and names it', () => {
    expect(() => readCsvTable('code\nCS401', columns)).toThrow(/missing the column name/);
  });

  it('refuses an empty file', () => {
    expect(() => readCsvTable('', columns)).toThrow(/empty/);
  });

  it('fills a short row with empty values rather than shifting columns', () => {
    const table = readCsvTable('code,name\nCS401', columns);
    expect(table.records[0]?.values).toEqual({ code: 'CS401', name: '' });
  });
});

describe('the template round-trip', () => {
  it('reads its own template back as one complete record', () => {
    const template = buildCsvTemplate(STUDENT_CSV_COLUMNS, STUDENT_CSV_EXAMPLE);
    const table = readCsvTable(template, STUDENT_CSV_COLUMNS);

    expect(table.records).toHaveLength(1);
    for (const [index, column] of STUDENT_CSV_COLUMNS.entries()) {
      expect(table.records[0]?.values[column]).toBe(STUDENT_CSV_EXAMPLE[index]);
    }
  });

  it('survives an example whose cell contains a comma', () => {
    const template = buildCsvTemplate(['code', 'note'], ['CS401', 'Consensus, replication']);
    expect(readCsvTable(template, ['code', 'note']).records[0]?.values.note).toBe(
      'Consensus, replication',
    );
  });
});

describe('readCsvList', () => {
  it('splits on spaces, commas and semicolons and drops the gaps', () => {
    expect(readCsvList(' CS201,  CS202; CS203 ')).toEqual(['CS201', 'CS202', 'CS203']);
  });

  it('reads an empty cell as no items', () => {
    expect(readCsvList('   ')).toEqual([]);
  });
});
