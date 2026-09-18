import { describe, expect, it } from 'vitest';
import { parseMigrationFileNames, selectPendingMigrations } from './migrationRunner.js';

describe('parseMigrationFileNames', () => {
  it('parses and sorts migrations by version, ignoring non-SQL files', () => {
    const migrations = parseMigrationFileNames([
      '0002_create_courses.sql',
      'README.md',
      '0001_create_schema_migrations.sql',
    ]);

    expect(migrations).toEqual([
      {
        version: '0001',
        name: 'create_schema_migrations',
        fileName: '0001_create_schema_migrations.sql',
      },
      { version: '0002', name: 'create_courses', fileName: '0002_create_courses.sql' },
    ]);
  });

  it('rejects malformed filenames', () => {
    expect(() => parseMigrationFileNames(['1_bad.sql'])).toThrow(/Invalid migration filename/);
    expect(() => parseMigrationFileNames(['0001_Bad-Name.sql'])).toThrow(
      /Invalid migration filename/,
    );
  });

  it('rejects duplicate versions', () => {
    expect(() => parseMigrationFileNames(['0001_first.sql', '0001_second.sql'])).toThrow(
      /Duplicate migration version 0001/,
    );
  });
});

describe('selectPendingMigrations', () => {
  it('returns only migrations that have not been applied, in order', () => {
    const migrations = parseMigrationFileNames(['0001_a.sql', '0002_b.sql', '0003_c.sql']);

    const pending = selectPendingMigrations(migrations, new Set(['0001', '0003']));

    expect(pending.map((migration) => migration.version)).toEqual(['0002']);
  });
});
