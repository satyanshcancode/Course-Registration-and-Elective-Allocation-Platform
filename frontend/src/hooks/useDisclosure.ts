import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { useLocation } from 'react-router';

export interface Disclosure {
  /** Whether the panel is showing. Already accounts for navigation. */
  open: boolean;
  toggle: () => void;
  close: () => void;
  /** Wrap the trigger AND the panel: a click inside this does not close it. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** The trigger, so focus returns to it when Escape closes the panel. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** For `aria-controls` on the trigger and `id` on the panel. */
  panelId: string;
}

/**
 * A panel that hangs off a button in the chrome: the account menu, the
 * notification popover, a card's "⋮".
 *
 * It closes on Escape (returning focus to the trigger), on a pointer down
 * outside it, and when the reader navigates. That last one is done by
 * remembering the page the panel was opened on and comparing it during
 * render, rather than with a setState in an effect, which would cost a second
 * render on every navigation.
 */
export function useDisclosure(): Disclosure {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [openedOn, setOpenedOn] = useState(pathname);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const showing = open && openedOn === pathname;

  return {
    open: showing,
    panelId,
    containerRef,
    triggerRef,
    toggle: () => {
      setOpen(!showing);
      setOpenedOn(pathname);
    },
    close: () => {
      setOpen(false);
    },
  };
}
