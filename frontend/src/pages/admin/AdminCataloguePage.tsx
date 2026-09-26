import {
  COURSE_CSV_COLUMNS,
  COURSE_CSV_EXAMPLE,
  type AdminCatalogue,
  type AdminCourseRecord,
  type CreateCourseRequest,
} from '@course-reg/shared';
import { Archive, BookPlus, CircleCheck, CircleSlash, Pencil, RotateCcw } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import {
  confirmCourseImport,
  createCourse,
  getAdminCatalogue,
  previewCourseImport,
  setCourseActive,
  updateCourse,
} from '../../api/adminCatalogueApi';
import { unwrap } from '../../api/unwrap';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { CourseCode } from '../../components/CourseCode';
import { CsvImport } from '../../components/CsvImport';
import { DataTable, type DataTableStatus } from '../../components/DataTable';
import type { Column } from '../../components/DataTable/tableLogic';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { findRowAction } from '../../utils/tableActions';
import { CourseForm, readCourseServerErrors, type CourseFormErrors } from './catalogue/CourseForm';
import styles from './AdminCataloguePage.module.css';

/** Where a course is offered, in one phrase. */
function describeUse(course: AdminCourseRecord): string {
  if (course.offeredIn.length === 0) {
    return 'Not offered in any window';
  }
  const live = course.offeredIn.filter((use) => use.status !== 'DRAFT');
  return live.length === 0
    ? `Offered in ${course.offeredIn.length} draft ${course.offeredIn.length === 1 ? 'window' : 'windows'}`
    : live.map((use) => `${use.windowName} (${use.status.toLowerCase()})`).join(', ');
}

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; course: AdminCourseRecord }
  | { kind: 'retire'; course: AdminCourseRecord }
  | { kind: 'reinstate'; course: AdminCourseRecord };

/**
 * The course catalogue as an administrator maintains it.
 *
 * Distinct from `/admin/courses`, which is the current window's OFFERINGS and
 * their seats. This page owns the records: what a course is, what it requires,
 * and whether it may still be offered.
 *
 * Retiring never deletes. A course that has been offered is referenced by
 * submissions, enrollments and stored allocation results, so it is retired
 * instead — and only while no live window offers it, which the server re-checks
 * and a trigger backs up.
 */
export function AdminCataloguePage() {
  useDocumentTitle('Course catalogue');
  const toast = useToast();
  const { state, retry } = useAsync<AdminCatalogue>(async (signal) =>
    unwrap(await getAdminCatalogue(signal)),
  );

  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [formErrors, setFormErrors] = useState<CourseFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // The last loaded catalogue is kept while a reload is in flight, so reloading
  // after an import does not unmount the panel that is reporting what it did.
  const catalogue =
    state.status === 'success'
      ? state.data
      : state.status === 'loading'
        ? state.previous
        : undefined;
  const courses = catalogue?.courses ?? [];
  const retired = courses.filter((course) => !course.isActive).length;

  const status: DataTableStatus =
    state.status === 'error'
      ? { kind: 'error', message: state.message, onRetry: retry }
      : state.status === 'success'
        ? { kind: 'ready' }
        : { kind: 'loading' };

  const close = () => {
    setDialog(null);
    setFormErrors({});
  };

  const handleSave = async (request: CreateCourseRequest, existing?: AdminCourseRecord) => {
    setFormErrors({});
    setSubmitting(true);
    // An edit sends everything EXCEPT the code: the code identifies the course
    // in the path, and every submission and stored result refers to it, so it
    // is not something an edit can carry.
    const { code, ...withoutCode } = request;
    void code;
    const response = existing
      ? await updateCourse(existing.code, withoutCode)
      : await createCourse(request);
    setSubmitting(false);

    if (!response.success) {
      const fieldErrors = readCourseServerErrors(response.errors);
      setFormErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) {
        toast.show({
          tone: 'danger',
          title: 'Could not save the course',
          message: response.message,
        });
      }
      return;
    }
    close();
    toast.show({
      tone: 'success',
      title: `${response.data.code} saved`,
      message: response.message ?? '',
    });
    retry();
  };

  const handleActivation = async (course: AdminCourseRecord, isActive: boolean) => {
    const response = await setCourseActive(course.code, isActive);
    close();
    toast.show(
      response.success
        ? { tone: 'success', title: response.message ?? 'Saved' }
        : {
            tone: 'danger',
            title: `Could not ${isActive ? 'reinstate' : 'retire'} ${course.code}`,
            message: response.message,
          },
    );
    if (response.success) {
      retry();
    }
  };

  /**
   * One listener on the table body: the row buttons carry data-action and
   * data-course-code and have no onClick of their own.
   */
  const handleBodyClick = (event: MouseEvent<HTMLTableSectionElement>) => {
    const action = findRowAction(event.target, event.currentTarget);
    if (!action) {
      return;
    }
    const course = courses.find((candidate) => candidate.code === action.courseCode);
    if (!course) {
      return;
    }
    if (action.action === 'edit') {
      setFormErrors({});
      setDialog({ kind: 'edit', course });
    } else if (action.action === 'retire') {
      setDialog({ kind: 'retire', course });
    } else if (action.action === 'reinstate') {
      setDialog({ kind: 'reinstate', course });
    }
  };

  const columns: Column<AdminCourseRecord>[] = [
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
    { id: 'credits', header: 'Credits', key: 'credits', align: 'end', sortable: true },
    {
      id: 'requires',
      header: 'Requires',
      accessor: (row) =>
        `sem ${row.minSemester}${row.minCredits > 0 ? ` · ${row.minCredits} cr` : ''}${
          row.prerequisites.length > 0
            ? ` · ${row.prerequisites.map((item) => item.code).join(' ')}`
            : ''
        }`,
      sortable: true,
      cell: (row) => (
        <span className={styles.requires}>
          Sem {row.minSemester}
          {row.minCredits > 0 && ` · ${row.minCredits} credits`}
          {row.prerequisites.length > 0 && (
            <span className={styles.prereqs}>
              {row.prerequisites.map((item) => item.code).join(', ')}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'programs',
      header: 'Programmes',
      accessor: (row) =>
        row.eligiblePrograms.length === 0
          ? 'All programmes'
          : row.eligiblePrograms.map((item) => item.code).join(' '),
      sortable: true,
      cell: (row) => (
        <span className={styles.programs}>
          {row.eligiblePrograms.length === 0
            ? 'All programmes'
            : row.eligiblePrograms.map((item) => item.code).join(', ')}
          {row.relevantPrograms.length > 0 && (
            <span className={styles.relevance}>
              +{row.relevantPrograms.map((item) => item.code).join(', ')}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'offered',
      header: 'Offered in',
      accessor: describeUse,
      sortable: true,
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (row) => (row.isActive ? 'Active' : 'Retired'),
      sortable: true,
      cell: (row) =>
        row.isActive ? (
          <Badge tone="success" icon={CircleCheck} status="ACTIVE">
            Active
          </Badge>
        ) : (
          <Badge tone="neutral" icon={Archive} status="RETIRED">
            Retired
          </Badge>
        ),
    },
    {
      id: 'actions',
      header: 'Actions',
      accessor: () => null,
      searchable: false,
      cell: (row) => (
        <div className={styles.rowActions}>
          {/* No onClick: one delegated listener on the tbody handles these. */}
          <button
            type="button"
            className={styles.rowButton}
            data-action="edit"
            data-course-code={row.code}
          >
            <Pencil aria-hidden="true" className={styles.rowIcon} />
            Edit<span className="visually-hidden"> {row.code}</span>
          </button>
          {row.isActive ? (
            <button
              type="button"
              className={styles.rowButton}
              data-action="retire"
              data-course-code={row.code}
              disabled={!row.canDeactivate}
              title={
                row.canDeactivate ? undefined : 'A window that is open or later offers this course.'
              }
            >
              <CircleSlash aria-hidden="true" className={styles.rowIcon} />
              Retire<span className="visually-hidden"> {row.code}</span>
            </button>
          ) : (
            <button
              type="button"
              className={styles.rowButton}
              data-action="reinstate"
              data-course-code={row.code}
            >
              <RotateCcw aria-hidden="true" className={styles.rowIcon} />
              Reinstate<span className="visually-hidden"> {row.code}</span>
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Course catalogue"
        kicker="Administration · Catalogue"
        description="Every course and the rules that decide who may take it. Seats belong to a window's offering, not to the course — edit those under Courses."
        actions={
          <div className={styles.headerActions}>
            <Button
              variant="secondary"
              aria-expanded={showImport}
              onClick={() => {
                setShowImport((current) => !current);
              }}
            >
              {showImport ? 'Hide CSV import' : 'Import CSV'}
            </Button>
            <Button
              variant="primary"
              iconStart={BookPlus}
              disabled={state.status !== 'success'}
              onClick={() => {
                setFormErrors({});
                setDialog({ kind: 'create' });
              }}
            >
              Add course
            </Button>
          </div>
        }
      >
        {catalogue && (
          <p className={styles.summary}>
            {courses.length} {courses.length === 1 ? 'course' : 'courses'}
            {retired > 0 && ` · ${retired} retired`}
          </p>
        )}
      </PageHeader>

      <div className={styles.body}>
        {showImport && catalogue && (
          <CsvImport
            itemName={{ one: 'course', other: 'courses' }}
            columns={COURSE_CSV_COLUMNS}
            example={COURSE_CSV_EXAMPLE}
            templateFileName="courses-template.csv"
            onPreview={previewCourseImport}
            onConfirm={confirmCourseImport}
            onImported={(report) => {
              toast.show({
                tone: 'success',
                title: `${report.counts.imported} courses imported`,
                message: 'They can now be offered in a draft registration window.',
              });
              retry();
            }}
          >
            <p>
              One row per course. A prerequisite may name a course an earlier row of the same file
              creates. Every valid row is written in a single transaction; rows that already exist
              or have errors are left out and listed for you.
            </p>
          </CsvImport>
        )}

        <DataTable
          caption="Course catalogue"
          rows={courses}
          columns={columns}
          getRowId={(row) => row.code}
          pageSize={20}
          initialSort={{ columnId: 'code', direction: 'ascending' }}
          filterLabel="Filter courses"
          filterPlaceholder="Filter by code, name, department or programme"
          status={status}
          itemName={{ one: 'course', other: 'courses' }}
          emptyTitle="The catalogue is empty"
          emptyMessage="Add a course, or import a CSV file, to get started."
          getRowTone={(row) => (row.isActive ? undefined : 'warning')}
          onBodyClick={handleBodyClick}
        />
      </div>

      <Modal
        open={(dialog?.kind === 'create' || dialog?.kind === 'edit') && catalogue !== undefined}
        onClose={close}
        title={dialog?.kind === 'edit' ? `Edit ${dialog.course.code}` : 'Add a course'}
        description={
          dialog?.kind === 'edit'
            ? 'Rules take effect for every window that has not yet opened. Old and new values are written to the audit log.'
            : 'A new course can be added to a registration window while that window is still a draft.'
        }
      >
        {catalogue && (dialog?.kind === 'create' || dialog?.kind === 'edit') && (
          <CourseForm
            catalogue={catalogue}
            {...(dialog.kind === 'edit' && { existing: dialog.course })}
            errors={formErrors}
            submitting={submitting}
            onSubmit={(request) => {
              void handleSave(request, dialog.kind === 'edit' ? dialog.course : undefined);
            }}
            onCancel={close}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={dialog?.kind === 'retire' || dialog?.kind === 'reinstate'}
        title={
          dialog?.kind === 'reinstate'
            ? `Reinstate ${dialog.course.code}?`
            : dialog?.kind === 'retire'
              ? `Retire ${dialog.course.code}?`
              : ''
        }
        confirmLabel={dialog?.kind === 'reinstate' ? 'Reinstate' : 'Retire'}
        tone={dialog?.kind === 'reinstate' ? 'default' : 'danger'}
        message={
          dialog?.kind === 'reinstate'
            ? `${dialog.course.code} can be offered in a registration window again. Nothing else changes.`
            : dialog?.kind === 'retire'
              ? `${dialog.course.code} will stay in every window that already offers it, and in every submission, enrolment and result that refers to it — nothing is deleted. It simply cannot be added to a new window. You can reinstate it at any time.`
              : ''
        }
        onCancel={close}
        onConfirm={() => {
          if (dialog?.kind === 'retire' || dialog?.kind === 'reinstate') {
            return handleActivation(dialog.course, dialog.kind === 'reinstate');
          }
          return undefined;
        }}
      />
    </>
  );
}
