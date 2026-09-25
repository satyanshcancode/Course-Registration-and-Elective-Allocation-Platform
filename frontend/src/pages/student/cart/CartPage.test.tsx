import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as courseApi from '../../../api/courseApi';
import * as registrationApi from '../../../api/registrationApi';
import { CartProvider } from '../../../hooks/useCart';
import { expectNoA11yViolations } from '../../../test/axe';
import { ok } from '../../../test/catalogueFixtures';
import { draftCart, receiptFor, submittedCart } from '../../../test/registrationFixtures';
import { renderRoute } from '../../../test/renderRoute';
import { CartPage } from './CartPage';

vi.mock('../../../api/registrationApi', () => ({
  getCart: vi.fn(),
  saveCart: vi.fn(),
  submitCart: vi.fn(),
  getSubmissionStatus: vi.fn(),
}));
vi.mock('../../../api/courseApi', async (importOriginal) => ({
  ...(await importOriginal<typeof courseApi>()),
  getSeats: vi.fn(),
}));

const api = vi.mocked(registrationApi);

function renderCart() {
  return renderRoute(
    <CartProvider>
      <CartPage />
    </CartProvider>,
    {
      path: '/student/cart',
      routes: [
        { path: '/student/courses', element: <h1>Catalogue</h1> },
        { path: '/student/results', element: <h1>Results</h1> },
      ],
    },
  );
}

/** The ranked items, in the order they appear. */
function rankedNames(): string[] {
  return screen
    .getAllByRole('listitem')
    .map((item) => item.querySelector('h3')?.textContent ?? '')
    .filter(Boolean)
    .map((text) => text.replace(/^Choice \d+: /, ''));
}

function itemFor(name: string) {
  const heading = screen.getByRole('heading', { level: 3, name: new RegExp(name) });
  const item = heading.closest('li');
  if (!item) {
    throw new Error(`No cart item for ${name}`);
  }
  return within(item);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(courseApi).getSeats.mockResolvedValue({ kind: 'not-modified' });
  api.getCart.mockResolvedValue(ok(draftCart()));
  api.saveCart.mockImplementation((courseCodes) => {
    const source = draftCart();
    const items = courseCodes.map((code, index) => {
      const item = source.items.find((candidate) => candidate.code === code);
      if (!item) {
        throw new Error(`Unexpected code ${code}`);
      }
      return { ...item, rank: (index + 1) as 1 | 2 | 3 | 4 | 5 };
    });
    return Promise.resolve(
      ok({
        ...source,
        items,
        totalCredits: items.reduce((total, item) => total + item.credits, 0),
      }),
    );
  });
});

describe('CartPage', () => {
  it('lists the ranked courses with their totals, and is accessible', async () => {
    const { container } = renderCart();

    expect(await screen.findByRole('heading', { name: 'Your ranked choices' })).toBeVisible();
    expect(rankedNames()).toEqual([
      'Artificial Intelligence',
      'Cloud Security',
      'Distributed Systems',
    ]);
    expect(screen.getByText('3 of 5 · 11 credits')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('moves an item up, keeps focus on it and announces the new position', async () => {
    const user = userEvent.setup();
    renderCart();
    await screen.findByRole('heading', { name: 'Your ranked choices' });

    await user.click(
      itemFor('Cloud Security').getByRole('button', { name: /Move Cloud Security up/ }),
    );

    expect(rankedNames()).toEqual([
      'Cloud Security',
      'Artificial Intelligence',
      'Distributed Systems',
    ]);
    expect(screen.getByText('Cloud Security moved to choice 1 of 3.')).toBeInTheDocument();
    // "Move up" is now disabled at rank 1, so focus lands on the next control.
    await waitFor(() => {
      expect(document.activeElement).toBe(
        itemFor('Cloud Security').getByRole('button', { name: /Move Cloud Security down/ }),
      );
    });
  });

  it('reorders from the keyboard alone', async () => {
    const user = userEvent.setup();
    renderCart();
    await screen.findByRole('heading', { name: 'Your ranked choices' });

    itemFor('Distributed Systems')
      .getByRole('button', { name: /Move Distributed Systems up/ })
      .focus();
    await user.keyboard('{Enter}');

    expect(rankedNames()).toEqual([
      'Artificial Intelligence',
      'Distributed Systems',
      'Cloud Security',
    ]);
  });

  it('removes an item and reports the unsaved change until the draft is saved', async () => {
    const user = userEvent.setup();
    renderCart();
    await screen.findByRole('heading', { name: 'Your ranked choices' });
    expect(screen.getByText('Everything is saved.')).toBeInTheDocument();

    await user.click(
      itemFor('Cloud Security').getByRole('button', { name: /Remove Cloud Security/ }),
    );

    expect(rankedNames()).toEqual(['Artificial Intelligence', 'Distributed Systems']);
    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
    // Submitting is refused until the draft matches what the server holds.
    expect(screen.getByRole('button', { name: 'Submit preferences' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      expect(screen.getByText('Everything is saved.')).toBeInTheDocument();
    });
    expect(api.saveCart).toHaveBeenCalledWith(['CS401', 'CS403']);
  });

  it('submits with one idempotency key and reuses it for the retry after a network failure', async () => {
    const user = userEvent.setup();
    const cart = draftCart();
    api.submitCart
      .mockResolvedValueOnce({
        success: false,
        data: null,
        message: 'Could not reach the server.',
        httpStatus: null,
      })
      .mockResolvedValueOnce(ok(receiptFor(submittedCart())));
    api.getCart.mockResolvedValue(ok(cart));
    renderCart();
    await screen.findByRole('heading', { name: 'Your ranked choices' });

    await user.click(screen.getByRole('button', { name: 'Submit preferences' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Submit preferences' }));

    expect(
      await screen.findByText(
        /We couldn’t confirm your submission\. Retrying is safe — it won’t create a duplicate\./,
      ),
    ).toBeVisible();

    await user.click(dialog.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(api.submitCart).toHaveBeenCalledTimes(2);
    });
    const [first, second] = api.submitCart.mock.calls;
    expect(first?.[1]).toBeTruthy();
    // The SAME key: the server replays instead of creating a second submission.
    expect(second?.[1]).toBe(first?.[1]);
  });

  it('reloads the cart when the server says it changed', async () => {
    const user = userEvent.setup();
    api.submitCart.mockResolvedValue({
      success: false,
      data: null,
      message: 'Your cart changed since you opened this page.',
      details: [{ type: 'CART_CHANGED' }],
      httpStatus: 409,
    });
    renderCart();
    await screen.findByRole('heading', { name: 'Your ranked choices' });
    expect(api.getCart).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Submit preferences' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Submit preferences' }));

    await waitFor(() => {
      expect(api.getCart).toHaveBeenCalledTimes(2);
    });
    expect(
      screen.getByText(/Your cart changed since this page loaded\. It has been reloaded/),
    ).toBeVisible();
  });

  it('shows the receipt instead of the editor once the cart is submitted', async () => {
    api.getCart.mockResolvedValue(ok(submittedCart()));
    const { container } = renderCart();

    expect(
      await screen.findByRole('heading', { name: 'Your preferences are recorded' }),
    ).toBeVisible();
    expect(screen.getByText('REF-3F9A2C71')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('explains why the cart is empty and where to go', async () => {
    api.getCart.mockResolvedValue(ok(draftCart({ items: [], totalCredits: 0 })));
    renderCart();

    expect(await screen.findByRole('heading', { name: 'Your cart is empty' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Browse the catalogue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit preferences' })).toBeDisabled();
  });

  it('says why submitting is blocked before the window opens', async () => {
    api.getCart.mockResolvedValue(
      ok(
        draftCart({
          submittable: false,
          submitBlockedReason: 'Registration opens on 21 September.',
        }),
      ),
    );
    renderCart();

    expect(await screen.findByText('Registration opens on 21 September.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Submit preferences' })).toBeDisabled();
  });
});
