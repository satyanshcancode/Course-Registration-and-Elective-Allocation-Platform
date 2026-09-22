import { useRef, useState, type ReactNode } from 'react';
import { Button } from '../Button';
import { Modal } from '../Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, in plain words (e.g. "Your seat goes to the next student."). */
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** 'danger' for irreversible actions: red confirm button, focus starts on Cancel. */
  tone?: 'default' | 'danger';
  /** May be async; the confirm button shows a spinner until it settles. */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/** A yes/no question on top of Modal, with typed confirm and cancel handlers. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  };

  const cancel = () => {
    if (!pending) {
      onCancel();
    }
  };

  return (
    <Modal
      open={open}
      onClose={cancel}
      title={title}
      description={message}
      size="sm"
      // Irreversible actions start on the safe choice.
      initialFocusRef={tone === 'danger' ? cancelRef : confirmRef}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" onClick={cancel}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={pending}
            onClick={() => {
              void handleConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
