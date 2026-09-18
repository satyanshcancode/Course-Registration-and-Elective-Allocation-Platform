import { describe, expect, it } from 'vitest';
import { createSeededRandom } from './random.js';

describe('createSeededRandom', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    const draw = (r: ReturnType<typeof createSeededRandom>) =>
      Array.from({ length: 5 }, () => r.next());

    expect(draw(a)).toEqual(draw(b));
  });

  it('produces different sequences for different seeds', () => {
    expect(createSeededRandom(1).next()).not.toBe(createSeededRandom(2).next());
  });

  it('keeps values inside the requested bounds', () => {
    const random = createSeededRandom(7);
    const values = Array.from({ length: 1_000 }, () => random.int(3, 6));

    expect(values.every((value) => value >= 3 && value <= 6)).toBe(true);
    expect(new Set(values)).toEqual(new Set([3, 4, 5, 6]));
  });

  it('shuffles without losing or duplicating items', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = createSeededRandom(99).shuffle(items);

    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('respects weights, never picking zero-weight items', () => {
    const random = createSeededRandom(3);
    const picks = Array.from({ length: 200 }, () =>
      random.weightedPick(['never', 'always'], (item) => (item === 'always' ? 1 : 0)),
    );

    expect(picks.every((pick) => pick === 'always')).toBe(true);
  });

  it('generates deterministic RFC 4122 version-4-shaped UUIDs', () => {
    const uuid = createSeededRandom(5).uuid();

    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(createSeededRandom(5).uuid()).toBe(uuid);
  });

  it('rejects invalid seeds and ranges', () => {
    expect(() => createSeededRandom(-1)).toThrow(RangeError);
    expect(() => createSeededRandom(1.5)).toThrow(RangeError);
    expect(() => createSeededRandom(1).int(5, 1)).toThrow(RangeError);
    expect(() => createSeededRandom(1).pick([])).toThrow(RangeError);
  });
});
