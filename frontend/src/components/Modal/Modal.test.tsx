import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../../test/axe';
import { Modal } from './Modal';

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        View course
      </button>
      <Modal
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        title="Artificial Intelligence"
        description="CS401 · 4 credits"
      >
        <p>20 of 20 seats allocated.</p>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('opens as a labelled dialog via showModal()', async () => {
    const user = userEvent.setup();
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    const { container } = render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'View course' }));

    expect(showModal).toHaveBeenCalledOnce();
    const dialog = screen.getByRole('dialog', { name: 'Artificial Intelligence' });
    expect(dialog).toHaveAccessibleDescription('CS401 · 4 credits');
    await expectNoA11yViolations(container);
  });

  it('closes on Escape (the dialog "cancel" event) and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const trigger = screen.getByRole('button', { name: 'View course' });

    await user.click(trigger);
    const dialog = screen.getByRole('dialog');
    // Browsers fire "cancel" on the dialog when Escape is pressed.
    fireEvent(dialog, new Event('cancel', { cancelable: true }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(dialog).not.toHaveAttribute('open');
    expect(trigger).toHaveFocus();
  });

  it('closes from the Close button', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'View course' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'View course' })).toHaveFocus();
  });
});
