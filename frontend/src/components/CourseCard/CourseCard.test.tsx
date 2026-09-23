import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '../../test/axe';
import { catalogueCourses, makeCourse } from '../../test/catalogueFixtures';
import { CourseCard } from './CourseCard';

function renderCard(course = makeCourse()) {
  return render(
    <MemoryRouter>
      <CourseCard course={course} to={`/student/courses/${course.code}`} />
    </MemoryRouter>,
  );
}

describe('CourseCard', () => {
  it('shows seats, demand, eligibility and status as text, not colour alone', async () => {
    const { container } = renderCard(
      makeCourse({ capacity: 50, allocated: 37, available: 13, demand: 82, demandRatio: 1.64 }),
    );
    const card = screen.getByRole('article');

    expect(within(card).getByRole('link', { name: 'Artificial Intelligence' })).toHaveAttribute(
      'href',
      '/student/courses/CS401',
    );
    expect(card).toHaveTextContent('CS401');
    expect(card).toHaveTextContent('4 credits');
    expect(card).toHaveTextContent('37 of 50 allocated · 13 left');
    expect(screen.getByRole('meter', { name: 'Seats in Artificial Intelligence' })).toHaveAttribute(
      'aria-valuetext',
      '37 of 50 allocated, 13 left',
    );
    expect(card).toHaveTextContent('82 requests · 1.6×');
    expect(card).toHaveTextContent('Oversubscribed');
    expect(card).toHaveTextContent('Eligible');
    expect(card).toHaveTextContent('Your status: Choice 1 · submitted');
    expect(card).toHaveTextContent('CS201');
    await expectNoA11yViolations(container);
  });

  it('gives the first reason a student is not eligible', () => {
    renderCard(catalogueCourses[1]);
    const card = screen.getByRole('article');
    expect(card).toHaveTextContent('Not eligible');
    expect(card).toHaveTextContent('Needs semester 7 — you’re in semester 6');
    expect(card).toHaveTextContent('Not selected');
    // 71 requests for 30 seats.
    expect(card).toHaveTextContent('Oversubscribed');
  });

  it('shows a waitlist place and no prerequisites plainly', () => {
    renderCard(catalogueCourses[2]);
    const card = screen.getByRole('article');
    expect(card).toHaveTextContent('Waitlisted · #7');
    expect(card).toHaveTextContent('PrerequisitesNone');
    expect(card).toHaveTextContent('38 of 40 allocated · 2 left');
    expect(card).not.toHaveTextContent('Oversubscribed');
  });

  it('leaves out personal fields when there are none (admin view)', () => {
    renderCard(makeCourse({ personal: null }));
    expect(screen.queryByText('Eligibility')).not.toBeInTheDocument();
    expect(screen.queryByText(/Your status/)).not.toBeInTheDocument();
  });
});
