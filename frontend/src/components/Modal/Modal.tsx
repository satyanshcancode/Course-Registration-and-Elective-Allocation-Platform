import { X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react';
import { currentlyFocused } from '../../utils/domUtils';
import { Icon } from '../Icon';
import styles from './Modal.module.css';

export interface ModalProps {
  open: boolean;
  /** Called for Escape, the close button and a click on the backdrop. */
  onClose: () => void;
  title: string;
  /** Short explanation under the title, linked as the dialog's description. */
  description?: ReactNode;
  children?: ReactNode;
  /** Action buttons, right-aligned at the bottom. */
  footer?: ReactNode;
  size?: 'sm' | 'md';
  /** Element to focus when opened (default: the first focusable element). */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * A modal built on the native <dialog> element: showModal() gives a real top
 * layer, inert background and focus containment for free. Controlled via
 * `open`; focus returns to whatever opened it.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  initialFocusRef,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      returnFocusRef.current = currentlyFocused();
      dialog.showModal();
      initialFocusRef?.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialFocusRef]);

  // Unmounting while open must still hand focus back.
  useEffect(
    () => () => {
      returnFocusRef.current?.focus();
    },
    [],
  );

  // Escape fires "cancel"; keep the dialog controlled by the parent instead.
  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onClose();
  };

  const handleClose = () => {
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target?.isConnected) {
      target.focus();
    }
  };

  // A click whose target is the <dialog> itself landed on the backdrop.
  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    // The backdrop click is a mouse shortcut; Escape and the Close button are
    // the keyboard equivalents, so no key handler is needed here.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      data-size={size}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
      onClose={handleClose}
      onClick={handleClick}
    >
      <div className={styles.panel}>
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} onClick={onClose}>
            <Icon icon={X} size={20} />
            <span className="visually-hidden">Close</span>
          </button>
        </header>
        {description && (
          <p id={descriptionId} className={styles.description}>
            {description}
          </p>
        )}
        {children && <div className={styles.body}>{children}</div>}
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </dialog>
  );
}
