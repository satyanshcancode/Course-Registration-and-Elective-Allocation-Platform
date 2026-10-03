import type { InviteCoAdminRequest, TeamList, TeamMember } from '@course-reg/shared';
import { MailCheck, UserPlus } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { Navigate } from 'react-router';
import {
  getTeam,
  inviteCoAdmin,
  resendTeamInvitation,
  setTeamMemberActive,
} from '../../api/teamApi';
import { ApiRequestError, unwrap } from '../../api/unwrap';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, type DataTableStatus } from '../../components/DataTable';
import type { Column } from '../../components/DataTable/tableLogic';
import { ErrorMessage } from '../../components/ErrorMessage';
import { FormField } from '../../components/FormField';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { useAsync } from '../../hooks/useAsync';
import { useCanManageStaff } from '../../hooks/useAuth';
import { roleLabel, roleSummary, teamStatusDetail } from '../../utils/roleText';
import styles from './TeamPage.module.css';

/** Which member a confirm dialog is about, and what it would do to them. */
interface Pending {
  member: TeamMember;
  isActive: boolean;
}

/** Derived, never a second field that could disagree with the status. */
function isActive(member: TeamMember): boolean {
  return member.status !== 'DEACTIVATED';
}

interface InviteErrors {
  name?: string;
  email?: string;
}

export function TeamPage() {
  const canManageStaff = useCanManageStaff();
  const toast = useToast();
  const [team, setTeam] = useState<TeamList | null>(null);
  const [inviting, setInviting] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const resource = useAsync<TeamList>(async (signal) => {
    const list = unwrap(await getTeam(signal));
    setTeam(list);
    return list;
  });

  // A co-administrator who types the URL is sent back rather than shown an
  // empty page. The server refuses every call behind it either way; this is
  // only so the interface does not pretend the page exists for them.
  if (!canManageStaff) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const status: DataTableStatus =
    resource.state.status === 'error'
      ? { kind: 'error', message: resource.state.message, onRetry: resource.retry }
      : resource.state.status === 'success' || team !== null
        ? { kind: 'ready' }
        : { kind: 'loading' };

  const members = team?.members ?? [];
  const lastAdmin = (team?.activeAdmins ?? 0) <= 1;

  const act = async (id: string, run: () => Promise<TeamList>, message: string) => {
    setBusyId(id);
    try {
      setTeam(await run());
      toast.show({ tone: 'success', title: message });
    } catch (error) {
      toast.show({
        tone: 'danger',
        title: 'That did not work',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const columns: Column<TeamMember>[] = [
    {
      id: 'name',
      header: 'Name',
      accessor: (row) => row.name ?? row.email,
      sortable: true,
      cell: (row) => (
        <span className={styles.who}>
          <span className={styles.name}>
            {row.name ?? <span className={styles.unnamed}>No name recorded</span>}
            {row.isSelf && <span className={styles.self}> (you)</span>}
          </span>
          <span className={styles.email}>{row.email}</span>
        </span>
      ),
    },
    {
      id: 'role',
      header: 'Role',
      accessor: (row) => roleLabel(row.role),
      sortable: true,
      cell: (row) => (
        <span className={styles.who}>
          <span className={styles.name}>{roleLabel(row.role)}</span>
          <span className={styles.email}>{roleSummary(row.role)}</span>
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (row) => row.status,
      sortable: true,
      cell: (row) => (
        <span className={styles.who}>
          <StatusBadge kind="teamMember" status={row.status} />
          <span className={styles.email}>{teamStatusDetail(row.status)}</span>
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      accessor: () => null,
      searchable: false,
      cell: (row) => {
        // The last active administrator keeps their access: there must always
        // be somebody who can manage these accounts. The server enforces it;
        // the disabled button explains it before anyone tries.
        const active = isActive(row);
        const blocked = active && row.role === 'ADMIN' && lastAdmin;
        return (
          <span className={styles.actions}>
            {row.status === 'INVITED' && (
              <Button
                variant="ghost"
                size="sm"
                iconStart={MailCheck}
                loading={busyId === row.id}
                onClick={() =>
                  void act(
                    row.id,
                    async () => unwrap(await resendTeamInvitation(row.id)),
                    `A new invitation is on its way to ${row.email}.`,
                  )
                }
              >
                Resend invitation
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={blocked}
              loading={busyId === row.id}
              onClick={() => {
                setPending({ member: row, isActive: !active });
              }}
              title={blocked ? 'There must always be one active administrator.' : undefined}
            >
              {active ? 'Deactivate' : 'Reactivate'}
            </Button>
          </span>
        );
      },
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        kicker="Administration · Accounts"
        title="Team"
        description="Who can administer registration. Co-administrators do everything except manage these accounts."
        actions={
          <Button
            iconStart={UserPlus}
            onClick={() => {
              setInviting(true);
            }}
          >
            Invite co-admin
          </Button>
        }
      />

      {resource.state.status === 'error' && team === null && (
        <ErrorMessage
          title="Could not load the team"
          message={resource.state.message}
          onRetry={resource.retry}
        />
      )}

      <DataTable
        caption="Administrators and co-administrators"
        rows={members}
        columns={columns}
        getRowId={(row) => row.id}
        status={status}
        filterable={false}
        paginated={false}
        itemName={{ one: 'account', other: 'accounts' }}
        emptyTitle="No staff accounts"
        emptyMessage="Invite a co-administrator to share the work of running registration."
      />

      <InviteDialog
        open={inviting}
        onClose={() => {
          setInviting(false);
        }}
        onInvited={(list, email) => {
          setTeam(list);
          setInviting(false);
          toast.show({ tone: 'success', title: `Invitation sent to ${email}.` });
        }}
      />

      <ConfirmDialog
        open={pending !== null}
        title={pending?.isActive === true ? 'Reactivate this account?' : 'Deactivate this account?'}
        tone={pending?.isActive === true ? 'default' : 'danger'}
        message={
          pending === null ? null : pending.isActive ? (
            <>
              {pending.member.name ?? pending.member.email} will be able to sign in again, with the
              same {roleLabel(pending.member.role).toLowerCase()} access as before.
            </>
          ) : (
            <>
              {pending.member.name ?? pending.member.email} is signed out immediately and cannot
              sign in again. Everything they did stays in the audit log, and the account can be
              reactivated later.
            </>
          )
        }
        confirmLabel={pending?.isActive === true ? 'Reactivate' : 'Deactivate'}
        onCancel={() => {
          setPending(null);
        }}
        onConfirm={async () => {
          if (!pending) {
            return;
          }
          const { member, isActive } = pending;
          setPending(null);
          await act(
            member.id,
            async () => unwrap(await setTeamMemberActive(member.id, isActive)),
            isActive
              ? `${member.name ?? member.email} can sign in again.`
              : `${member.name ?? member.email} is deactivated and signed out.`,
          );
        }}
      />
    </div>
  );
}

interface InviteDialogProps {
  open: boolean;
  onClose: () => void;
  onInvited: (team: TeamList, email: string) => void;
}

/**
 * Name and e-mail, and nothing else. There is deliberately no role picker:
 * this form can only ever create a co-administrator, which is what keeps it
 * from being a way to mint another administrator.
 */
function InviteDialog({ open, onClose, onInvited }: InviteDialogProps) {
  const [form, setForm] = useState<InviteCoAdminRequest>({ name: '', email: '' });
  const [errors, setErrors] = useState<InviteErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const close = () => {
    setForm({ name: '', email: '' });
    setErrors({});
    setFailure(null);
    onClose();
  };

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    setErrors({});
    setFailure(null);
    setSending(true);
    try {
      const result = unwrap(await inviteCoAdmin(form));
      setForm({ name: '', email: '' });
      onInvited(result.team, result.member.email);
    } catch (error) {
      // A duplicate address comes back as a field error on `email`, so it is
      // shown against the field rather than only in the banner.
      if (error instanceof ApiRequestError) {
        const fields: InviteErrors = {};
        for (const fieldError of error.fieldErrors) {
          if (fieldError.field === 'name' || fieldError.field === 'email') {
            fields[fieldError.field] = fieldError.message;
          }
        }
        setErrors(fields);
      }
      setFailure(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Invite a co-administrator">
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <p className={styles.formNote}>
          They receive an e-mail with a single-use link and set their own password. A
          co-administrator can do everything an administrator can, except manage these accounts.
        </p>
        <FormField label="Name" error={errors.name} required>
          {(control) => (
            <Input
              {...control}
              name="name"
              autoComplete="name"
              maxLength={120}
              value={form.name}
              onChange={(event) => {
                setForm({ ...form, name: event.target.value });
              }}
            />
          )}
        </FormField>
        <FormField label="University e-mail" error={errors.email} required>
          {(control) => (
            <Input
              {...control}
              type="email"
              name="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => {
                setForm({ ...form, email: event.target.value });
              }}
            />
          )}
        </FormField>
        {failure !== null && (
          <ErrorMessage title="Could not send the invitation" message={failure} />
        )}
        <div className={styles.formActions}>
          <Button type="button" variant="secondary" onClick={close} disabled={sending}>
            Cancel
          </Button>
          <Button type="submit" loading={sending}>
            Send invitation
          </Button>
        </div>
      </form>
    </Modal>
  );
}
