import type { CSSProperties } from 'react';

/** Inline styles that may also set CSS custom properties, e.g. { '--fill': '74%' }. */
export type CSSWithVariables = CSSProperties & Record<`--${string}`, string | number>;
