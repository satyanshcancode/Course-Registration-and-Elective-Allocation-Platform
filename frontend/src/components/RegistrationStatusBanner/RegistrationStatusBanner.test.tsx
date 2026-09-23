import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as courseApi from '../../api/courseApi';
import { RegistrationWindowProvider } from '../../hooks/useRegistrationWindow';
import { expectNoA11yViolations } from '../../test/axe';
import { fallWindow, ok } from '../../test/catalogueFixtures';
import { renderRoute } from '../../test/renderRoute';
import { RegistrationStatusBanner } from './RegistrationStatusBanner';

vi.mock('../../api/courseApi', () => ({ getCurrentWindow: vi.fn() }));

const api = vi.mocked(courseApi);

/**
 * The device clock is deliberately wrong (two days behind). Everything the
 * banner says must come from the server's time instead.
 */
const DEVICE_NOW = new Date('2026-09-19T10:00:00.000Z');
const SERVER_NOW = '2026-09-21T10:00:00.000Z';

function renderBanner() {
  return renderRoute(
    <RegistrationWindowProvider>
      <RegistrationStatusBanner />
    </RegistrationWindowProvider>,
    { path: '/student/dashboard' },
  );
}

describe('RegistrationStatusBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(DEVICE_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down from the server’s clock, not the device’s', async () => {
    api.getCurrentWindow.mockResolvedValue(
      ok({
        // Closes 3h 12m after the SERVER's now; the device thinks it is 2 days earlier.
        window: { ...fallWindow, status: 'OPEN', endsAt: '2026-09-21T13:12:00.000Z' },
        serverTime: SERVER_NOW,
      }),
    );

    renderBanner();

    expect(await screen.findByText('Fall 2026')).toBeInTheDocument();
    expect(screen.getByText('3h 12m')).toBeInTheDocument();
    expect(screen.getByText('Closes in')).toBeInTheDocument();
  });

  it('ticks down while the page is open', async () => {
    api.getCurrentWindow.mockResolvedValue(
      ok({
        window: { ...fallWindow, status: 'OPEN', endsAt: '2026-09-21T10:00:45.000Z' },
        serverTime: SERVER_NOW,
      }),
    );

    renderBanner();
    const seconds = async () => {
      const value = await screen.findByText(/^\d+s$/);
      return Number.parseInt(value.textContent, 10);
    };
    const before = await seconds();
    expect(before).toBeLessThanOrEqual(45);

    await vi.advanceTimersByTimeAsync(3000);
    expect(await seconds()).toBeLessThan(before);
  });

  it('does not announce the countdown: it is in no live region', async () => {
    api.getCurrentWindow.mockResolvedValue(
      ok({ window: { ...fallWindow, status: 'OPEN' }, serverTime: SERVER_NOW }),
    );

    renderBanner();
    const banner = (await screen.findByText('Fall 2026')).closest('p');

    // Nothing in or around the banner announces itself, so a screen reader is
    // not interrupted every second. (The toast region below is the app's own.)
    expect(banner?.closest('[aria-live], [role="status"], [role="alert"]')).toBeNull();
    expect(banner?.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
  });

  it('counts down to the opening while the window is a draft', async () => {
    api.getCurrentWindow.mockResolvedValue(
      ok({
        window: { ...fallWindow, status: 'DRAFT', startsAt: '2026-09-23T14:00:00.000Z' },
        serverTime: SERVER_NOW,
      }),
    );

    renderBanner();
    expect(await screen.findByText('Opens in')).toBeInTheDocument();
    expect(screen.getByText('2d 4h')).toBeInTheDocument();
  });

  it('says so when nothing is scheduled', async () => {
    api.getCurrentWindow.mockResolvedValue(ok({ window: null, serverTime: SERVER_NOW }));

    renderBanner();
    expect(
      await screen.findByText('No registration window has been scheduled yet.'),
    ).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    api.getCurrentWindow.mockResolvedValue(
      ok({ window: { ...fallWindow, status: 'OPEN' }, serverTime: SERVER_NOW }),
    );

    const { container } = renderBanner();
    await screen.findByText('Fall 2026');
    await expectNoA11yViolations(container);
  });
});
