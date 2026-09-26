import type { CsvImportReport, CsvImportRow } from '@course-reg/shared';
import { CircleCheck, CircleSlash, TriangleAlert } from 'lucide-react';
import { Badge } from '../Badge';
import { DataTable } from '../DataTable';
import type { Column } from '../DataTable/tableLogic';
import styles from './CsvImportReportTable.module.css';

export interface CsvImportReportTableProps {
  report: CsvImportReport;
  itemName: { one: string; other: string };
}

/**
 * The verdict of every row, in the same table before and after the import: the
 * preview says what WILL happen, the confirm says what DID. Verdict and
 * messages are the server's own.
 *
 * The status is an icon plus words, never a colour alone, and the reason column
 * carries the whole explanation — so the table is readable printed, or by
 * somebody who cannot tell the tones apart.
 */
export function CsvImportReportTable({ report, itemName }: CsvImportReportTableProps) {
  /** The first column of a row: whatever identifies it in this kind of file. */
  const identity = (row: CsvImportRow): string =>
    row.values.rollNumber ?? row.values.code ?? `line ${row.line}`;

  const columns: Column<CsvImportRow>[] = [
    { id: 'line', header: 'Line', accessor: (row) => row.line, align: 'end', sortable: true },
    {
      id: 'identity',
      header: itemName.one === 'student' ? 'Roll number' : 'Code',
      accessor: identity,
      sortable: true,
      cell: (row) => <span className={styles.mono}>{identity(row)}</span>,
    },
    { id: 'name', header: 'Name', accessor: (row) => row.values.name ?? '', sortable: true },
    {
      id: 'verdict',
      header: report.applied ? 'Result' : 'Verdict',
      accessor: (row) => row.verdict.kind,
      sortable: true,
      cell: (row) => {
        switch (row.verdict.kind) {
          case 'ok':
            return (
              <Badge
                tone="success"
                icon={CircleCheck}
                status={report.applied ? 'IMPORTED' : 'READY'}
              >
                {report.applied ? 'Imported' : 'Ready'}
              </Badge>
            );
          case 'duplicate':
            return (
              <Badge tone="warning" icon={CircleSlash} status="SKIPPED">
                Already exists
              </Badge>
            );
          default:
            return (
              <Badge tone="danger" icon={TriangleAlert} status="INVALID">
                Not imported
              </Badge>
            );
        }
      },
    },
    {
      id: 'reason',
      header: 'Detail',
      // Searchable, so an administrator can filter a long report by the problem.
      accessor: (row) =>
        row.verdict.kind === 'invalid'
          ? row.verdict.errors.map((error) => `${error.column} ${error.message}`).join('; ')
          : row.verdict.kind === 'duplicate'
            ? row.verdict.message
            : '',
      cell: (row) => {
        if (row.verdict.kind === 'ok') {
          return <span className={styles.muted}>—</span>;
        }
        if (row.verdict.kind === 'duplicate') {
          return <span>{row.verdict.message}</span>;
        }
        return (
          <ul className={styles.errors}>
            {row.verdict.errors.map((error) => (
              <li key={`${error.column}-${error.message}`}>
                <span className={styles.column}>{error.column}</span> {error.message}
              </li>
            ))}
          </ul>
        );
      },
    },
  ];

  return (
    <DataTable
      caption={report.applied ? 'What was imported' : 'What the file contains'}
      rows={report.rows}
      columns={columns}
      getRowId={(row) => String(row.line)}
      pageSize={25}
      initialSort={{ columnId: 'line', direction: 'ascending' }}
      filterLabel="Filter rows"
      filterPlaceholder="Filter by code, name or problem"
      itemName={{ one: 'row', other: 'rows' }}
      emptyTitle="The file has no rows"
      emptyMessage="Only a header row was found. Add one line per student or course below it."
      getRowTone={(row) => (row.verdict.kind === 'ok' ? undefined : 'warning')}
    />
  );
}
