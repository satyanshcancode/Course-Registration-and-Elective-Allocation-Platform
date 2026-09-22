import type { AdminCourseOffering } from '@course-reg/shared';
import { CircleCheck, Pencil, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { getAdminCourses } from '../../api/adminApi';
import { unwrap } from '../../api/unwrap';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { CourseCode } from '../../components/CourseCode';
import { DataTable, type DataTableStatus } from '../../components/DataTable';
import { Icon } from '../../components/Icon';
import type { Column } from '../../components/DataTable/tableLogic';
import { PageHeader } from '../../components/PageHeader';
import { SeatMeter } from '../../components/SeatMeter';
import { useToast } from '../../components/Toast';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDemandRatio } from '../../utils/formatSeats';
import { EditCapacityDialog } from './courses/EditCapacityDialog';
import styles from './AdminCoursesPage.module.css';

export function AdminCoursesPage() {
  useDocumentTitle('Courses');
  const { state, retry } = useAsync(async (signal) => unwrap(await getAdminCourses(signal)));
  const toast = useToast();
  const [editing, setEditing] = useState<AdminCourseOffering | null>(null);
  // Rows saved in this session, shown in place of the loaded ones.
  const [saved, setSaved] = useState<ReadonlyMap<string, AdminCourseOffering>>(new Map());

  const list = state.status === 'success' ? state.data : undefined;
  const rows = (list?.items ?? []).map((row) => saved.get(row.code) ?? row);
  const oversubscribed = rows.filter((row) => row.oversubscribed).length;

  const status: DataTableStatus =
    state.status === 'error'
      ? { kind: 'error', message: state.message, onRetry: retry }
      : state.status === 'success'
        ? { kind: 'ready' }
        : { kind: 'loading' };

  const handleSaved = (updated: AdminCourseOffering) => {
    setSaved((current) => new Map(current).set(updated.code, updated));
    setEditing(null);
    toast.show({
      tone: 'success',
      title: `${updated.code} capacity is now ${updated.capacity}`,
      message: 'The change is recorded in the audit log.',
    });
  };

  const columns: Column<AdminCourseOffering>[] = [
    {
      id: 'code',
      header: 'Code',
      key: 'code',
      sortable: true,
      cell: (row) => <CourseCode code={row.code} size="sm" />,
    },
    { id: 'name', header: 'Course', key: 'name', sortable: true },
    {
      id: 'department',
      header: 'Dept',
      accessor: (row) => row.department.code,
      sortable: true,
    },
    { id: 'capacity', header: 'Capacity', key: 'capacity', align: 'end', sortable: true },
    {
      id: 'seats',
      header: 'Seats',
      key: 'available',
      sortable: true,
      searchable: false,
      cell: (row) => (
        <SeatMeter
          compact
          allocated={row.allocated}
          capacity={row.capacity}
          label={`Seats in ${row.name}`}
        />
      ),
    },
    { id: 'demand', header: 'Requests', key: 'demand', align: 'end', sortable: true },
    {
      id: 'ratio',
      header: 'Demand ratio',
      key: 'demandRatio',
      align: 'end',
      sortable: true,
      searchable: false,
      cell: (row) => formatDemandRatio(row.demand, row.capacity),
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (row) => (row.oversubscribed ? 'Oversubscribed' : 'Within capacity'),
      sortable: true,
      cell: (row) =>
        row.oversubscribed ? (
          <Badge tone="warning" icon={TrendingUp} status="OVERSUBSCRIBED">
            Oversubscribed
          </Badge>
        ) : (
          <span className={styles.within}>
            <Icon icon={CircleCheck} />
            Within capacity
          </span>
        ),
    },
    {
      id: 'actions',
      header: 'Actions',
      accessor: () => null,
      searchable: false,
      cell: (row) => (
        <Button
          size="sm"
          variant="ghost"
          iconStart={Pencil}
          onClick={() => {
            setEditing(row);
          }}
        >
          Edit capacity<span className="visually-hidden"> of {row.code}</span>
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Courses"
        kicker={list?.window ? `Administration · ${list.window.name}` : 'Administration'}
        description="Every offering in the current window, with seats and demand. Change a capacity when a room or section changes."
      >
        {list && rows.length > 0 && (
          <p className={styles.summary}>
            {rows.length} offerings · {oversubscribed} oversubscribed
          </p>
        )}
      </PageHeader>

      <div className={styles.body}>
        <DataTable
          caption={list?.window ? `${list.window.name} offerings` : 'Offerings'}
          rows={rows}
          columns={columns}
          getRowId={(row) => row.code}
          pageSize={20}
          initialSort={{ columnId: 'ratio', direction: 'descending' }}
          filterLabel="Filter offerings"
          filterPlaceholder="Filter by code, name or department"
          status={status}
          itemName={{ one: 'offering', other: 'offerings' }}
          emptyTitle="No offerings in this window"
          emptyMessage="Courses appear here once they are offered in a registration window."
          getRowTone={(row) => (row.oversubscribed ? 'warning' : undefined)}
        />
      </div>

      <EditCapacityDialog
        offering={editing}
        onClose={() => {
          setEditing(null);
        }}
        onSaved={handleSaved}
      />
    </>
  );
}
