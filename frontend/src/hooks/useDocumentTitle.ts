import { useEffect } from 'react';

const APP_NAME = 'Allocademy';

/** Sets the browser tab title for the current page, e.g. "Sign in · Allocademy". */
export function useDocumentTitle(pageTitle: string): void {
  useEffect(() => {
    document.title = `${pageTitle} · ${APP_NAME}`;
  }, [pageTitle]);
}
