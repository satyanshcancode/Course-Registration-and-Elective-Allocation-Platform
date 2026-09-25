/**
 * The cart as the catalogue shows it: one delegated listener per surface, and
 * an explanation wherever a course cannot be added.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as courseApi from '../../../api/courseApi';
import * as registrationApi from '../../../api/registrationApi';
import { CartProvider } from '../../../hooks/useCart';
import { cataloguePage, currentWindow, makeCourse, ok } from '../../../test/catalogueFixtures';
import { draftCart } from '../../../test/registrationFixtures';
import { renderRoute } from '../../../test/renderRoute';
import { StudentCoursesPage } from '../StudentCoursesPage';

vi.mock('../../../api/courseApi', async (importOriginal) => ({
  ...(await importOriginal<typeof courseApi>()),
  getCurrentWindow: vi.fn(),
  getCatalogue: vi.fn(),
  getSeats: vi.fn(),
}));
vi.mock('../../../api/registrationApi', () => ({
  getCart: vi.fn(),
  saveCart: vi.fn(),
  submitCart: vi.fn(),
  getSubmissionStatus: vi.fn(),
}));

const courses = vi.mocked(courseApi);
const cart = vi.mocked(registrationApi);

function renderCatalogue(url = '/student/courses') {
  return renderRoute(
    <CartProvider>
      <StudentCoursesPage />
    </CartProvider>,
    {
      path: '/student/courses',
      url,
      routes: [{ path: '/student/courses/:code', element: <h1>Course detail page</h1> }],
    },
  );
}

/** The card for a course, found by its heading. */
function cardFor(name: string) {
  const heading = screen.getByRole('heading', { name });
  const card = heading.closest('article');
  if (!card) {
    throw new Error(`No card for ${name}`);
  }
  return within(card);
}

beforeEach(() => {
  vi.clearAllMocks();
  courses.getCurrentWindow.mockResolvedValue(ok(currentWindow));
  courses.getCatalogue.mockResolvedValue(ok(cataloguePage()));
  courses.getSeats.mockResolvedValue({ kind: 'not-modified' });
  cart.getCart.mockResolvedValue(ok(draftCart({ items: [], totalCredits: 0 })));
  cart.saveCart.mockImplementation((courseCodes) =>
    Promise.resolve(
      ok(draftCart({ items: draftCart().items.filter((i) => courseCodes.includes(i.code)) })),
    ),
  );
});

describe('adding to the cart from the catalogue', () => {
  it('adds from a card through the list’s single delegated listener', async () => {
    const user = userEvent.setup();
    renderCatalogue();
    await screen.findByRole('heading', { name: 'Showing 1–3 of 3 courses' });

    await user.click(
      cardFor('Artificial Intelligence').getByRole('button', { name: /Add to cart/ }),
    );

    await waitFor(() => {
      expect(cart.saveCart).toHaveBeenCalledWith(['CS401']);
    });
    expect(await screen.findByText('CS401 added to your cart')).toBeVisible();
  });

  it('adds from the table through the tbody’s single delegated listener', async () => {
    const user = userEvent.setup();
    renderCatalogue('/student/courses?view=table');
    await screen.findByRole('table');

    const row = screen.getByRole('row', { name: /Renewable Energy Systems/ });
    await user.click(within(row).getByRole('button', { name: /Add to cart/ }));

    await waitFor(() => {
      expect(cart.saveCart).toHaveBeenCalledWith(['ME302']);
    });
  });

  it('offers to remove a course already in the cart, showing its rank', async () => {
    cart.getCart.mockResolvedValue(ok(draftCart()));
    const user = userEvent.setup();
    renderCatalogue();
    await screen.findByRole('heading', { name: 'Showing 1–3 of 3 courses' });

    const card = cardFor('Cloud Security');
    expect(card.getByText('Choice 2')).toBeInTheDocument();

    await user.click(card.getByRole('button', { name: /Remove Cloud Security/ }));

    await waitFor(() => {
      expect(cart.saveCart).toHaveBeenCalledWith(['CS401', 'CS403']);
    });
  });

  it('explains ineligibility instead of showing an add button', async () => {
    courses.getCatalogue.mockResolvedValue(
      ok(
        cataloguePage([
          makeCourse({
            personal: {
              eligibility: {
                eligible: false,
                reasons: [{ type: 'SEMESTER_TOO_LOW', required: 7, actual: 6 }],
              },
              myStatus: { code: 'NOT_SELECTED' },
            },
          }),
        ]),
      ),
    );
    renderCatalogue();
    await screen.findByRole('heading', { name: 'Artificial Intelligence' });

    const card = cardFor('Artificial Intelligence');
    expect(card.queryByRole('button', { name: /Add to cart/ })).not.toBeInTheDocument();
    expect(card.getByText('Not eligible — this course can’t be ranked.')).toBeVisible();
    // The reason stays where it already was, beside the eligibility badge.
    expect(card.getByText('Needs semester 7 — you’re in semester 6')).toBeVisible();
  });

  it('says the cart is full once five courses are ranked', async () => {
    const five = draftCart();
    cart.getCart.mockResolvedValue(
      ok({
        ...five,
        items: [
          ...five.items,
          { ...five.items[0]!, rank: 4, code: 'CS404', name: 'Blockchain' },
          { ...five.items[0]!, rank: 5, code: 'CS405', name: 'Robotics' },
        ],
      }),
    );
    renderCatalogue();
    await screen.findByRole('heading', { name: 'Showing 1–3 of 3 courses' });

    // ME302 is eligible and not ranked, but there is no room left for it.
    const card = cardFor('Renewable Energy Systems');
    expect(card.queryByRole('button', { name: /Add to cart/ })).not.toBeInTheDocument();
    expect(
      card.getByText(/Your cart is full \(5 courses\)\. Remove one to add Renewable/),
    ).toBeVisible();
  });
});
