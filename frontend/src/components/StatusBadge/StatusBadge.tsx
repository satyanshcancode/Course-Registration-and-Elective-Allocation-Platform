import { Badge } from '../Badge';
import { presentStatus, type StatusKind, type StatusKinds } from './statusPresentation';

export interface StatusBadgeProps<K extends StatusKind> {
  kind: K;
  status: StatusKinds[K];
  /** Replaces the default wording, e.g. "Waitlisted · #7". */
  label?: string;
}

/**
 * A registration status shown as colour + icon + text, never colour alone.
 * Generic over the kind, so `<StatusBadge kind="allocation" status="OPEN" />`
 * is a type error.
 */
export function StatusBadge<K extends StatusKind>({ kind, status, label }: StatusBadgeProps<K>) {
  const presentation = presentStatus(kind, status);
  return (
    <Badge tone={presentation.tone} icon={presentation.icon} status={status}>
      {label ?? presentation.label}
    </Badge>
  );
}
