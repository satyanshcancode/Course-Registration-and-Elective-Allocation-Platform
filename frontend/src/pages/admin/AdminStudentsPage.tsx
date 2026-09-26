import {
  ADMIN_STUDENT_STATUSES,
  STUDENT_CSV_COLUMNS,
  STUDENT_CSV_EXAMPLE,
  type AdminReferenceData,
  type AdminStudentListItem,
  type AdminStudentQuery,
  type AdminStudentStatus,
  type CreateStudentRequest,
} from '@course-reg/shared';
import { CircleCheck, CircleSlash, MailCheck, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  confirmStudentImport,
  createStudent,
  getReferenceData,
  getStudents,
  previewStudentImport,
} from '../../api/adminStudentApi';
import { unwrap } from '../../api/unwrap';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { CsvImport } from '../../components/CsvImport';
import { DataTable, type DataTableStatus } from '../../components/DataTable';
import type { Column } from '../../components/DataTable/tableLogic';
import { ErrorMessage } from '../../components/ErrorMessage';
import { FormField } from '../../components/FormField';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { Select } from '../../components/Select';
import { useToast } from '../../components/Toast';
import { useAsync } from '../../hooks/useAsync';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { describeStudentStatus } from '../../utils/accountText';
import { readServerErrors, StudentForm, type StudentFormErrors } from './students/StudentForm';
import styles from './AdminStudentsPage.module.css';

const STATUS_TONES: Readonly<Record<AdminStudentStatus, 'accent' | 'success' | 'neutral'>> = {
  INVITED: 'accent',
  ACTIVE: 'success',
  INACTIVE: 'neutral',
};

const STATUS_ICONS = {
  INVITED: MailCheck,
  ACTIVE: CircleCheck,
  INACTIVE: CircleSlash,
} as const;

/** Filters live in the URL, so a view can be shared or refreshed. */
function readFilters(params: URLSearchParams): AdminStudentQuery {
  const semester = Number(params.get('semester'));
  const status = params.get('status');
  const page = Number(params.get('page'));
  return {
    ...(params.get('search') && { search: params.get('search') ?? '' }),
    ...(params.get('program') && { program: params.get('program') ?? '' }),
    ...(Number.isInteger(semester) && semester >= 1 && semester <= 8 && { semester }),
    ...((ADMIN_STUDENT_STATUSES as readonly string[]).includes(status ?? '') && {
      status: status as AdminStudentStatus,
    }),
    ...(Number.isInteger(page) && page > 1 && { page }),
  };
}

export function AdminStudentsPage() {
  useDocumentTitle('Students');
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);

  const [searchDraft, setSearchDraft] = useState(filters.search ?? '');
  // The list is a server query, so typing is debounced rather than requested
  // per keystroke.
  const search = useDebouncedValue(searchDraft, 300);

  const [creating, setCreating] = useState(false);
  const [formErrors, setFormErrors] = useState<StudentFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // The debounced box owns `search` once the page is loaded, so the URL's value
  // is deliberately NOT merged in: keeping it would let a `?search=` survive the
  // box being cleared, leaving the list filtered by a term nobody can see. It is
  // read once, as the box's initial value, and that is all.
  const query: AdminStudentQuery = {
    ...(filters.program !== undefined && { program: filters.program }),
    ...(filters.semester !== undefined && { semester: filters.semester }),
    ...(filters.status !== undefined && { status: filters.status }),
    ...(filters.page !== undefined && { page: filters.page }),
    ...(search ? { search } : {}),
  };
  const queryKey = JSON.stringify(query);

  const { state, retry } = useAsync(async (signal) => unwrap(await getStudents(query, signal)), {
    key: queryKey,
  });
  const reference = useAsync<AdminReferenceData>(async (signal) =>
    unwrap(await getReferenceData(signal)),
  );

  const page = state.status === 'success' ? state.data : undefined;
  const previous = state.status === 'loading' ? state.previous : undefined;
  const shown = page ?? previous;

  const status: DataTableStatus =
    state.status === 'error'
      ? { kind: 'error', message: state.message, onRetry: retry }
      : state.status === 'success'
        ? { kind: 'ready' }
        : { kind: 'loading' };

  /** Writes one filter to the URL and returns to page 1. */
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === '') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    next.delete('page');
    setParams(next, { replace: true });
  };

  const changePage = (nextPage: number) => {
    const next = new URLSearchParams(params);
    if (nextPage <= 1) {
      next.delete('page');
    } else {
      next.set('page', String(nextPage));
    }
    setParams(next);
  };

  const handleCreate = async (request: CreateStudentRequest) => {
    setFormErrors({});
    setSubmitting(true);
    const response = await createStudent(request);
    setSubmitting(false);

    if (!response.success) {
      const fieldErrors = readServerErrors(response.errors);
      setFormErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) {
        toast.show({
          tone: 'danger',
          title: 'Could not create the student',
          message: response.message,
        });
      }
      return;
    }
    setCreating(false);
    toast.show({
      tone: 'success',
      title: `${response.data.student.name} created`,
      message: `An invitation has been e-mailed to ${response.data.student.email}. It expires in 48 hours.`,
    });
    retry();
  };

  const columns: Column<AdminStudentListItem>[] = [
    {
      id: 'rollNumber',
      header: 'Roll number',
      key: 'rollNumber',
      sortable: true,
      cell: (row) => (
        <Link
          className={styles.rollLink}
          to={`/admin/students/${encodeURIComponent(row.rollNumber)}`}
        >
          {row.rollNumber}
        </Link>
      ),
    },
    { id: 'name', header: 'Name', key: 'name', sortable: true },
    { id: 'email', header: 'E-mail', key: 'email', sortable: true },
    {
      id: 'program',
      header: 'Programme',
      accessor: (row) => row.program.code,
      sortable: true,
    },
    { id: 'semester', header: 'Sem', key: 'semester', align: 'end', sortable: true },
    {
      id: 'credits',
      header: 'Credits',
      key: 'creditsCompleted',
      align: 'end',
      sortable: true,
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (row) => describeStudentStatus(row.status).label,
      sortable: true,
      cell: (row) => (
        <Badge tone={STATUS_TONES[row.status]} icon={STATUS_ICONS[row.status]} status={row.status}>
          {describeStudentStatus(row.status).label}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Students"
        kicker="Administration · Records"
        description="Every student account. Students never register themselves: you create the account and they set their own password from the invitation."
        actions={
          <div className={styles.headerActions}>
            <Button
              variant="secondary"
              onClick={() => {
                setShowImport((current) => !current);
              }}
              aria-expanded={showImport}
            >
              {showImport ? 'Hide CSV import' : 'Import CSV'}
            </Button>
            <Button
              variant="primary"
              iconStart={UserPlus}
              disabled={reference.state.status !== 'success'}
              onClick={() => {
                setFormErrors({});
                setCreating(true);
              }}
            >
              Add student
            </Button>
          </div>
        }
      >
        {shown && (
          <p className={styles.summary}>
            {shown.total} {shown.total === 1 ? 'student' : 'students'} match these filters
          </p>
        )}
      </PageHeader>

      <div className={styles.body}>
        {reference.state.status === 'error' && (
          <ErrorMessage
            message={`The programme and course lists could not be loaded, so the forms are unavailable: ${reference.state.message}`}
            onRetry={reference.retry}
          />
        )}

        {showImport && reference.state.status === 'success' && (
          <CsvImport
            itemName={{ one: 'student', other: 'students' }}
            columns={STUDENT_CSV_COLUMNS}
            example={STUDENT_CSV_EXAMPLE}
            templateFileName="students-template.csv"
            onPreview={previewStudentImport}
            onConfirm={confirmStudentImport}
            onImported={(report) => {
              toast.show({
                tone: 'success',
                title: `${report.counts.imported} students imported`,
                message: `${report.invitationsSent ?? 0} invited by e-mail. Anyone who was not can be invited again from their page.`,
              });
              retry();
            }}
          >
            <p>
              One row per student. Every valid row is created in a single transaction and invited by
              e-mail; rows that already exist or have errors are left out and listed for you.
            </p>
          </CsvImport>
        )}

        <div className={styles.filters}>
          <FormField label="Search" hint="Name, roll number or e-mail">
            {(control) => (
              <Input
                {...control}
                type="search"
                name="search"
                autoComplete="off"
                value={searchDraft}
                onChange={(event) => {
                  setSearchDraft(event.target.value);
                }}
              />
            )}
          </FormField>

          <FormField label="Programme">
            {(control) => (
              <Select
                {...control}
                name="program"
                placeholder="All programmes"
                options={(shown?.programs ?? []).map((program) => ({
                  value: program.code,
                  label: program.code,
                }))}
                value={filters.program ?? ''}
                onChange={(event) => {
                  setFilter('program', event.target.value);
                }}
              />
            )}
          </FormField>

          <FormField label="Semester">
            {(control) => (
              <Select
                {...control}
                name="semester"
                placeholder="Any semester"
                options={[1, 2, 3, 4, 5, 6, 7, 8].map((semester) => ({
                  value: String(semester),
                  label: `Semester ${semester}`,
                }))}
                value={filters.semester === undefined ? '' : String(filters.semester)}
                onChange={(event) => {
                  setFilter('semester', event.target.value);
                }}
              />
            )}
          </FormField>

          <FormField label="Status">
            {(control) => (
              <Select
                {...control}
                name="status"
                placeholder="Any status"
                options={ADMIN_STUDENT_STATUSES.map((value) => ({
                  value,
                  label: describeStudentStatus(value).label,
                }))}
                value={filters.status ?? ''}
                onChange={(event) => {
                  setFilter('status', event.target.value);
                }}
              />
            )}
          </FormField>
        </div>

        <DataTable
          caption="Student accounts"
          rows={shown?.items ?? []}
          columns={columns}
          getRowId={(row) => row.rollNumber}
          // The server owns filtering, sorting and paging for this list.
          filterable={false}
          paginated={false}
          status={status}
          itemName={{ one: 'student', other: 'students' }}
          emptyTitle="No students match these filters"
          emptyMessage="Clear a filter, or add a student to get started."
        />

        {shown && shown.pageCount > 1 && (
          <Pagination
            page={shown.page}
            pageCount={shown.pageCount}
            onPageChange={changePage}
            label="Students, pages"
          />
        )}
      </div>

      <Modal
        open={creating && reference.state.status === 'success'}
        onClose={() => {
          setCreating(false);
        }}
        title="Add a student"
        description="The account is created and an invitation e-mailed in one step. If the e-mail cannot be sent, nothing is created."
      >
        {reference.state.status === 'success' && (
          <StudentForm
            reference={reference.state.data}
            errors={formErrors}
            submitting={submitting}
            onSubmit={(request) => {
              void handleCreate(request);
            }}
            onCancel={() => {
              setCreating(false);
            }}
          />
        )}
      </Modal>
    </>
  );
}
