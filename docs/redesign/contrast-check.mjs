/** WCAG 2.2 contrast ratios for the three redesign palettes. */
const hex = (h) => {
  const v = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
};
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h) => {
  const [r, g, b] = hex(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const sets = {
  '1 Signal': {
    bg: '#ffffff',
    pairs: [
      ['body text', '#0c0d0e', '#ffffff', 4.5],
      ['muted text', '#41464b', '#ffffff', 4.5],
      ['faint label', '#6b7177', '#ffffff', 4.5],
      ['signal on white', '#d12b0d', '#ffffff', 4.5],
      ['ok tag', '#0f5f4d', '#e4f1ed', 4.5],
      ['danger tag', '#d12b0d', '#fdeeea', 4.5],
      ['warn tag', '#8a5a00', '#fbf0d9', 4.5],
      ['white on ink btn', '#ffffff', '#0c0d0e', 4.5],
    ],
  },
  '2 Ledger': {
    bg: '#fbf9f5',
    pairs: [
      ['body text', '#14181d', '#fbf9f5', 4.5],
      ['muted text', '#4d5664', '#fbf9f5', 4.5],
      ['faint label', '#666e79', '#fbf9f5', 4.5],
      ['ochre eyebrow', '#915a0c', '#fbf9f5', 4.5],
      ['bone on navy hdr', '#f3efe7', '#16202e', 4.5],
      ['ok tag', '#2a5d3c', '#e3eee4', 4.5],
      ['danger tag', '#96281b', '#f6e5e1', 4.5],
      ['warn tag', '#915a0c', '#f7ecd9', 4.5],
      ['navy nav link', '#c7cfdb', '#16202e', 4.5],
    ],
  },
  '3 Quad': {
    bg: '#fdfbf7',
    pairs: [
      ['body text', '#241f1a', '#fdfbf7', 4.5],
      ['muted text', '#5b5248', '#fdfbf7', 4.5],
      ['faint label', '#776e64', '#fdfbf7', 4.5],
      ['terracotta eyebrow', '#a04a26', '#fdfbf7', 4.5],
      ['forest on clay', '#2f5d4a', '#e8e1d6', 4.5],
      ['ok tag', '#2f5d4a', '#dfe9e3', 4.5],
      ['danger tag', '#a04a26', '#f6e3da', 4.5],
      ['warn tag', '#8a5a06', '#f7ecd6', 4.5],
      ['white on forest btn', '#fdfbf7', '#2f5d4a', 4.5],
      ['white on terracotta', '#ffffff', '#a04a26', 4.5],
      ['white on ochre badge', '#ffffff', '#915a0c', 4.5],
    ],
  },
};

let fails = 0;
for (const [name, set] of Object.entries(sets)) {
  process.stdout.write(`\n--- Direction ${name} ---\n`);
  for (const [label, fg, bg, min] of set.pairs) {
    const r = ratio(fg, bg);
    const ok = r >= min;
    if (!ok) fails += 1;
    process.stdout.write(
      `  ${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2)}:1  ${label.padEnd(20)} ${fg} on ${bg}\n`,
    );
  }
}
process.stdout.write(
  `\n${fails === 0 ? 'All pairs meet WCAG AA (4.5:1).' : `${fails} pair(s) BELOW AA.`}\n`,
);
// Non-zero on failure, so this can gate a build rather than only inform one.
process.exitCode = fails === 0 ? 0 : 1;
