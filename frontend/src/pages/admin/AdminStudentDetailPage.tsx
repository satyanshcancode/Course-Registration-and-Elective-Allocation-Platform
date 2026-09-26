import type {
  AdminReferenceData,
  AdminStudentDetail,
  CreateStudentRequest,
} from '@course-reg/shared';
import { ArrowLeft, CircleCheck, CircleSlash, MailCheck, Pencil, Send, UserX } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  getReferenceData,
  getStudent,
  resendInvitation,
  setStudentActive,
  updateStudent,
} from '../../api/adminStudentApi';
import { isNotFound, unwrap } from '../../api/unwrap';
import { Badge } from '../../components/Badge';
import { Button, LinkButton } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { CourseCode } from '../../components/CourseCode';
import { EmptyState } from '../../components/EmptyState';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { PageLoading } from '../../components/PageLoading';
import { useToast } from '../../components/Toast';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { describeInvitationExpiry, describeStudentStatus } from '../../utils/accountText';
import { describeHistoryEvent } from '../../utils/historyText';
import { formatDateTime } from '../../utils/formatDate';
import { describeStanding } from '../../utils/statusText';
import { readServerErrors, StudentForm, type StudentFormErrors } from './students/StudentForm';
import styles from './AdminStudentDetailPage.module.css';

const STATUS_ICONS = {
  INVITED: MailCheck,
  ACTIVE: CircleCheck,
  INACTIVE: CircleSlash,
} as const;

const STATUS_TONES = { INVITED: 'accent', ACTIVE: 'success', INACTIVE: 'neutral' } as const;

/** The detail plus the moment it arrived, so no render reads the clock. */
interface LoadedDetail extends AdminStudentDetail {
  loadedAt: number;
}

/** How many timeline entries the page shows before pointing at the full list. */
const HISTORY_SHOWN = 12;

/**
 * One student's record, where they stand, and what has happened to them.
 *
 * The standing and the timeline are rendered by the SAME formatters the
 * student's own pages use (`describeStanding`, `describeHistoryEvent`), so there
 * is one set of sentences about registration rather than two that can drift
 * apart. They are written in the second person, which is why the section says
 * plainly that it is the student's own view.
 */
export function AdminStudentDetailPage() {
  const rollNumber = useParams().rollNumber ?? '';
  const toast = useToast();

  const { state, retry } = useAsync<LoadedDetail>(
    async (signal) => ({
      ...unwrap(await getStudent(rollNumber, signal)),
      // The clock is read where the response arrives, never during render: an
      // impure call there would make the same page re-render differently. The
      // wording is coarse (hours, days), so one reading per load is plenty.
      loadedAt: Date.now(),
    }),
    { key: rollNumber },
  );
  const reference = useAsync<AdminReferenceData>(async (signal) =>
    unwrap(await getReferenceData(signal)),
  );

  const [editing, setEditing] = useState(false);
  const [formErrors, setFormErrors] = useState<StudentFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState<'deactivate' | 'reactivate' | null>(null);
  const [working, setWorking] = useState(false);

  useDocumentTitle(state.status === 'success' ? state.data.student.name : 'Student');

  if (state.status === 'loading' || state.status === 'idle') {
    return <PageLoading label="Loading the student’s record…" />;
  }
  if (state.status === 'error') {
    return isNotFound(state.error) ? (
      <>
        <PageHeader title="Student not found" kicker="Administration · Records" />
        <EmptyState title={`No student has the roll number ${rollNumber}`} icon={UserX}>
          <p>
            It may have been changed. <Link to="/admin/students">Back to the student list</Link>.
          </p>
        </EmptyState>
      </>
    ) : (
      <>
        <PageHeader title="Student" kicker="Administration · Records" />
        <ErrorMessage message={state.message} onRetry={retry} />
      </>
    );
  }

  const detail = state.data;
  const { student } = detail;
  const wording = describeStudentStatus(student.status);

  const handleEdit = async (request: CreateStudentRequest) => {
    setFormErrors({});
    setSubmitting(true);
    const response = await updateStudent(rollNumber, request);
    setSubmitting(false);

    if (!response.success) {
      const fieldErrors = readServerErrors(response.errors);
      setFormErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) {
        toast.show({ tone: 'danger', title: 'Could not save', message: response.message });
      }
      return;
    }
    setEditing(false);
    toast.show({ tone: 'success', title: `${response.data.name}'s record saved` });
    retry();
  };

  const handleResend = async () => {
    setWorking(true);
    const response = await resendInvitation(rollNumber);
    setWorking(false);
    toast.show(
      response.success
        ? {
            tone: 'success',
            title: 'Invitation sent',
            message: response.message ?? '',
          }
        : { tone: 'danger', title: 'Could not send the invitation', message: response.message },
    );
    if (response.success) {
      retry();
    }
  };

  const handleActivation = async (isActive: boolean) => {
    setWorking(true);
    const response = await setStudentActive(rollNumber, isActive);
    setWorking(false);
    setConfirming(null);
    toast.show(
      response.success
        ? { tone: 'success', title: response.message ?? 'Saved' }
        : { tone: 'danger', title: 'Could not change the account', message: response.message },
    );
    if (response.success) {
      retry();
    }
  };

  return (
    <>
      <PageHeader
        title={student.name}
        kicker={`Administration · ${student.rollNumber}`}
        description={wording.explanation}
        actions={
          <div className={styles.headerActions}>
            <Button
              variant="secondary"
              iconStart={Pencil}
              disabled={reference.state.status !== 'success'}
              onClick={() => {
                setFormErrors({});
                setEditing(true);
              }}
            >
              Edit record
            </Button>
            {student.status === 'INVITED' && (
              <Button
                variant="secondary"
                iconStart={Send}
                loading={working}
                onClick={() => {
                  void handleResend();
                }}
              >
                Resend invitation
              </Button>
            )}
            <Button
              variant={student.status === 'INACTIVE' ? 'secondary' : 'danger'}
              iconStart={student.status === 'INACTIVE' ? CircleCheck : CircleSlash}
              onClick={() => {
                setConfirming(student.status === 'INACTIVE' ? 'reactivate' : 'deactivate');
              }}
            >
              {student.status === 'INACTIVE' ? 'Reactivate' : 'Deactivate'}
            </Button>
          </div>
        }
      >
        <LinkButton to="/admin/students" variant="ghost" size="sm" iconStart={ArrowLeft}>
          All students
        </LinkButton>
      </PageHeader>

      <div className={styles.body}>
        <Card title="Record">
          <div className={styles.statusRow}>
            <Badge
              tone={STATUS_TONES[student.status]}
              icon={STATUS_ICONS[student.status]}
              status={student.status}
            >
              {wording.label}
            </Badge>
            {detail.invitationExpiresAt !== null && (
              <span className={styles.expiry}>
                {describeInvitationExpiry(detail.invitationExpiresAt, detail.loadedAt)}
              </span>
            )}
          </div>

          <dl className={styles.record}>
            <div className={styles.entry}>
              <dt>E-mail</dt>
              <dd>{student.email}</dd>
            </div>
            <div className={styles.entry}>
              <dt>Programme</dt>
              <dd>
                {student.program.name}{' '}
                <span className={styles.muted}>({student.program.code})</span>
              </dd>
            </div>
            <div className={styles.entry}>
              <dt>Semester</dt>
              <dd>{student.semester}</dd>
            </div>
            <div className={styles.entry}>
              <dt>Credits completed</dt>
              <dd>{student.creditsCompleted}</dd>
            </div>
            <div className={styles.entry}>
              <dt>Expected graduation</dt>
              <dd>{student.expectedGraduationTerm}</dd>
            </div>
            <div className={styles.entry}>
              <dt>Completed courses</dt>
              <dd>
                {detail.completedCourses.length === 0 ? (
                  <span className={styles.muted}>None recorded</span>
                ) : (
                  <ul className={styles.courses}>
                    {detail.completedCourses.map((course) => (
                      <li key={course.code}>
                        <CourseCode code={course.code} size="sm" /> {course.name}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        <Card title="Registration status" kicker="As the student sees it">
          <p className={styles.standing}>{describeStanding(detail.status)}</p>
          {detail.status.submission && (
            <dl className={styles.record}>
              <div className={styles.entry}>
                <dt>Submission</dt>
                <dd>
                  {detail.status.submission.status === 'SUBMITTED' ? 'Submitted' : 'Draft'}
                  {detail.status.submission.reference !== null && (
                    <>
                      {' '}
                      <span className={styles.mono}>{detail.status.submission.reference}</span>
                    </>
                  )}
                  {detail.status.submission.submittedAt !== null && (
                    <>
                      {' · '}
                      {formatDateTime(detail.status.submission.submittedAt)}
                    </>
                  )}
                </dd>
              </div>
              <div className={styles.entry}>
                <dt>Ranked</dt>
                <dd>
                  {detail.status.submission.courseCodes.length === 0 ? (
                    <span className={styles.muted}>Nothing ranked</span>
                  ) : (
                    detail.status.submission.courseCodes.join(', ')
                  )}
                </dd>
              </div>
            </dl>
          )}
        </Card>

        <Card title="History" kicker="As the student sees it">
          {detail.history.length === 0 ? (
            <p className={styles.muted}>Nothing has happened on this account yet.</p>
          ) : (
            <ol className={styles.history}>
              {detail.history.slice(0, HISTORY_SHOWN).map((event) => (
                <li key={event.id} className={styles.event}>
                  <time className={styles.when} dateTime={event.at}>
                    {formatDateTime(event.at)}
                  </time>
                  <p className={styles.what}>{describeHistoryEvent(event)}</p>
                </li>
              ))}
            </ol>
          )}
          {detail.history.length > HISTORY_SHOWN && (
            <p className={styles.more}>
              Showing the {HISTORY_SHOWN} most recent of {detail.history.length} entries.
            </p>
          )}
        </Card>
      </div>

      <Modal
        open={editing && reference.state.status === 'success'}
        onClose={() => {
          setEditing(false);
        }}
        title={`Edit ${student.name}`}
        description="Every field is saved together, and the change is written to the audit log with its old and new values."
      >
        {reference.state.status === 'success' && (
          <StudentForm
            reference={reference.state.data}
            existing={student}
            completedCourses={detail.completedCourses.map((course) => course.code)}
            errors={formErrors}
            submitting={submitting}
            onSubmit={(request) => {
              void handleEdit(request);
            }}
            onCancel={() => {
              setEditing(false);
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming === 'reactivate' ? 'Reactivate this account?' : 'Deactivate this account?'
        }
        confirmLabel={confirming === 'reactivate' ? 'Reactivate' : 'Deactivate'}
        tone={confirming === 'reactivate' ? 'default' : 'danger'}
        message={
          confirming === 'reactivate'
            ? `${student.name} will be able to sign in again with their existing password. Nothing else changes.`
            : `${student.name} will no longer be able to sign in, and any open session ends on their next request. Every submission, enrolment, waitlist place and history entry is kept exactly as it is — nothing is deleted, and the account can be reactivated at any time.`
        }
        onCancel={() => {
          setConfirming(null);
        }}
        onConfirm={() => handleActivation(confirming === 'reactivate')}
      />
    </>
  );
}
