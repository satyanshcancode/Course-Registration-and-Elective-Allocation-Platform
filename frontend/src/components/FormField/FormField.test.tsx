import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '../../test/axe';
import { Input } from '../Input';
import { FormField } from './FormField';

describe('FormField', () => {
  it('labels the control and links hint and error through aria-describedby', async () => {
    const { container } = render(
      <FormField
        label="Roll number"
        hint="As printed on your student card."
        error="Roll numbers look like CSE24901."
        required
      >
        {(control) => <Input {...control} />}
      </FormField>,
    );
    const input = screen.getByRole('textbox', { name: /roll number/i });

    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(
      'As printed on your student card. Roll numbers look like CSE24901.',
    );
    await expectNoA11yViolations(container);
  });

  it('is not marked invalid and has no description without hint or error', () => {
    render(<FormField label="Search">{(control) => <Input {...control} />}</FormField>);
    const input = screen.getByRole('textbox', { name: 'Search' });

    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input).not.toBeRequired();
  });

  it('keeps a hidden label as the accessible name', () => {
    render(
      <FormField label="Filter courses" labelHidden>
        {(control) => <Input {...control} />}
      </FormField>,
    );
    expect(screen.getByRole('textbox', { name: 'Filter courses' })).toBeInTheDocument();
  });
});
