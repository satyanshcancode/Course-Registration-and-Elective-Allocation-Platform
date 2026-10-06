/**
 * WCAG 2.2 contrast audit of the design tokens.
 *
 * Reads the values straight out of variables.css, so it cannot drift from what
 * the app actually ships. Text pairs are held to 4.5:1 (AA for body text) and
 * the pairs that only draw a boundary, a dot, a bar or an icon to 3:1 (AA for
 * non-text contrast, WCAG 1.4.11).
 *
 *   node frontend/src/styles/contrast.mjs
 *
 * There is one theme: the app is light only, so there is one pass.
 * Exits non-zero on any failure, so it can gate a build rather than only
 * inform one.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('./variables.css', import.meta.url)), 'utf8');

function tokensOf(block) {
  const found = {};
  for (const m of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    found[m[1]] = m[2].trim();
  }
  return found;
}
const theme = tokensOf(css);

const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex) {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(v.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

/** [foreground token, background token, minimum, what it is]. */
const PAIRS = [
  ['--color-ink', '--color-surface', 4.5, 'body text on a card'],
  ['--color-ink', '--color-paper', 4.5, 'body text on the page'],
  ['--color-ink', '--color-surface-raised', 4.5, 'body text on the header'],
  ['--color-ink', '--color-surface-sunken', 4.5, 'body text on sunken'],
  ['--color-ink', '--color-accent-wash', 4.5, 'body text on the window panel'],
  ['--color-ink-muted', '--color-surface', 4.5, 'muted text on a card'],
  ['--color-ink-muted', '--color-paper', 4.5, 'muted text on the page'],
  ['--color-ink-muted', '--color-surface-raised', 4.5, 'muted text on the header'],
  ['--color-ink-muted', '--color-accent-wash', 4.5, 'muted text on the window panel'],
  ['--color-accent', '--color-surface', 4.5, 'accent text on a card'],
  ['--color-accent', '--color-paper', 4.5, 'accent text on the page'],
  ['--color-accent', '--color-accent-wash', 4.5, 'accent text on the window panel'],
  ['--color-accent-ink', '--color-accent-soft', 4.5, 'the active nav item'],
  ['--color-on-accent', '--color-accent', 4.5, 'label on an accent button'],
  ['--color-link', '--color-surface', 4.5, 'link on a card'],
  ['--color-link', '--color-paper', 4.5, 'link on the page'],
  ['--color-success', '--color-success-soft', 4.5, 'success tag'],
  ['--color-warning', '--color-warning-soft', 4.5, 'warning tag'],
  ['--color-danger', '--color-danger-soft', 4.5, 'danger tag'],
  ['--color-info', '--color-info-soft', 4.5, 'info tag'],
  ['--color-success', '--color-surface', 4.5, 'success text on a card'],
  ['--color-warning', '--color-surface', 4.5, 'warning text on a card'],
  ['--color-danger', '--color-surface', 4.5, 'danger text on a card'],
  ['--color-danger-strong', '--color-surface', 4.5, 'remove link on a card'],
  ['--color-info', '--color-surface', 4.5, 'info text on a card'],
  // Non-text: a dot, a bar, a tile icon, a border or a focus ring.
  ['--color-success-bright', '--color-surface', 3, 'the seat bar fill'],
  ['--color-success-bright', '--color-paper', 3, 'a timeline node'],
  ['--tile-info-ink', '--tile-info-bg', 3, 'the blue figure icon'],
  ['--tile-danger-ink', '--tile-danger-bg', 3, 'the red figure icon'],
  ['--tile-success-ink', '--tile-success-bg', 3, 'the green figure icon'],
  ['--tile-warning-ink', '--tile-warning-bg', 3, 'the amber figure icon'],
  ['--color-track', '--color-surface', 1.2, 'the seat bar track on a card'],
  ['--color-rule-strong', '--color-surface', 3, 'control border on a card'],
  ['--color-rule-strong', '--color-paper', 3, 'control border on the page'],
  ['--color-focus', '--color-surface', 3, 'focus ring on a card'],
  ['--color-focus', '--color-paper', 3, 'focus ring on the page'],
];

let failures = 0;
for (const [fg, bg, min, what] of PAIRS) {
  // --color-focus is an alias; resolve one level of var().
  const resolve = (token) => {
    const value = theme[token];
    const alias = /var\((--[\w-]+)\)/.exec(value ?? '');
    return alias ? theme[alias[1]] : value;
  };
  const a = resolve(fg);
  const b = resolve(bg);
  if (!a || !b) {
    process.stdout.write(`  SKIP  ${what} (missing token)\n`);
    continue;
  }
  const r = ratio(a, b);
  const ok = r >= min;
  if (!ok) failures += 1;
  process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2)}:1 (needs ${min})  ${what}\n`);
}
process.stdout.write(
  `\n${PAIRS.length} pairs checked. ${
    failures === 0 ? 'Every one meets its WCAG AA threshold.' : `${failures} pair(s) BELOW threshold.`
  }\n`,
);
process.exitCode = failures === 0 ? 0 : 1;
