/**
 * WCAG 2.2 contrast audit of the design tokens, both themes.
 *
 * Reads the values straight out of variables.css, so it cannot drift from what
 * the app actually ships. Text pairs are held to 4.5:1 (AA for body text) and
 * the pairs that only draw a boundary or a control to 3:1 (AA for non-text
 * contrast, WCAG 1.4.11).
 *
 *   node frontend/src/styles/contrast.mjs
 *
 * Exits non-zero on any failure, so it can gate a build rather than only
 * inform one.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('./variables.css', import.meta.url)), 'utf8');

/** The `:root` block, then the dark-theme block that overrides part of it. */
function tokensOf(block) {
  const found = {};
  for (const m of block.matchAll(/(--color-[\w-]+):\s*([^;]+);/g)) {
    found[m[1]] = m[2].trim();
  }
  return found;
}
const darkAt = css.indexOf('prefers-color-scheme: dark');
const light = tokensOf(css.slice(0, darkAt));
const dark = { ...light, ...tokensOf(css.slice(darkAt)) };

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
  ['--color-ink', '--color-surface', 4.5, 'body text on paper'],
  ['--color-ink', '--color-paper', 4.5, 'body text on clay'],
  ['--color-ink', '--color-surface-sunken', 4.5, 'body text on sunken'],
  ['--color-ink-muted', '--color-surface', 4.5, 'muted text on paper'],
  ['--color-ink-muted', '--color-paper', 4.5, 'muted text on clay'],
  ['--color-accent', '--color-surface', 4.5, 'accent text on paper'],
  ['--color-accent', '--color-paper', 4.5, 'accent text on clay'],
  ['--color-on-accent', '--color-accent', 4.5, 'label on accent button'],
  ['--color-success', '--color-success-soft', 4.5, 'success tag'],
  ['--color-warning', '--color-warning-soft', 4.5, 'warning tag'],
  ['--color-danger', '--color-danger-soft', 4.5, 'danger tag'],
  ['--color-info', '--color-info-soft', 4.5, 'info tag'],
  ['--color-success', '--color-surface', 4.5, 'success text on paper'],
  ['--color-warning', '--color-surface', 4.5, 'warning text on paper'],
  ['--color-danger', '--color-surface', 4.5, 'danger text on paper'],
  ['--color-dept-a', '--color-surface', 3, 'department spine A'],
  ['--color-dept-b', '--color-surface', 3, 'department spine B'],
  ['--color-dept-c', '--color-surface', 3, 'department spine C'],
  ['--color-dept-d', '--color-surface', 3, 'department spine D'],
  ['--color-dept-e', '--color-surface', 3, 'department spine E'],
  ['--color-rule-strong', '--color-surface', 3, 'control border on paper'],
  ['--color-rule-strong', '--color-paper', 3, 'control border on clay'],
  ['--color-focus', '--color-surface', 3, 'focus ring on paper'],
  ['--color-focus', '--color-paper', 3, 'focus ring on clay'],
];

let failures = 0;
for (const [name, theme] of [
  ['light', light],
  ['dark', dark],
]) {
  process.stdout.write(`\n--- ${name} theme ---\n`);
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
}
process.stdout.write(
  `\n${failures === 0 ? 'Every token pair meets its WCAG AA threshold.' : `${failures} pair(s) BELOW threshold.`}\n`,
);
process.exitCode = failures === 0 ? 0 : 1;
