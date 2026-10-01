import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/*
 * Testing Library's 1 s default for findBy and waitFor is a wall-clock budget,
 * and the heaviest page files (the catalogue, the cart, the import dialog) render
 * far more than that under two forks on a loaded machine — so they failed at
 * random while the assertions themselves were fine. The timeout only bounds how
 * long a WAITING query may take; a test that really is broken still fails, just
 * a few seconds later.
 */
configure({ asyncUtilTimeout: 5_000 });

/*
 * jsdom has <dialog> but not showModal()/close(). This polyfill mirrors the
 * parts the app relies on: `open` reflects state and close() fires "close".
 */
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function close(this: HTMLDialogElement) {
      if (this.open) {
        this.open = false;
        this.dispatchEvent(new Event('close'));
      }
    };
  }
}

/*
 * jsdom's File has no text() (or arrayBuffer()/stream()), though every browser
 * does. The CSV import reads an uploaded file with it, so it is polyfilled here
 * rather than avoided in the component.
 */
if (typeof File !== 'undefined' && typeof File.prototype.text !== 'function') {
  File.prototype.text = function text(this: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(typeof reader.result === 'string' ? reader.result : '');
      };
      reader.onerror = () => {
        reject(reader.error ?? new Error('Could not read the file'));
      };
      reader.readAsText(this);
    });
  };
}

/* jsdom has no matchMedia; report "no match" unless a test overrides it. */
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
