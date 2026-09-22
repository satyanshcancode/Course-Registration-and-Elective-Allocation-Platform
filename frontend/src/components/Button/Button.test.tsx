import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Send } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('is a real <button type="button"> by default', () => {
    render(<Button>Save draft</Button>);
    const button = screen.getByRole('button', { name: 'Save draft' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('loading: shows a spinner, sets aria-busy and ignores clicks but stays focusable', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button variant="primary" iconStart={Send} loading onClick={onClick}>
        Submitting…
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Submitting…' });

    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    // The spinner replaces the icon and is hidden from assistive technology.
    expect(button.querySelector('[aria-hidden="true"]')).not.toBeNull();

    // Unlike a disabled button it stays in the Tab order...
    await user.tab();
    expect(button).toHaveFocus();
    // ...but activating it does nothing while loading.
    await user.click(button);
    await user.keyboard('{Enter}');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('calls onClick when not loading', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Add to cart</Button>);

    await user.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('exposes the variant for styling', () => {
    render(<Button variant="danger">Drop course</Button>);
    expect(screen.getByRole('button', { name: 'Drop course' })).toHaveAttribute(
      'data-variant',
      'danger',
    );
  });
});
