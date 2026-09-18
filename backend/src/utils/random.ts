/**
 * Deterministic pseudo-random numbers. The same seed always produces the same
 * sequence, which makes seed data and allocation tie-breaks reproducible.
 * Not suitable for anything security-related.
 */
export interface SeededRandom {
  /** Seed the generator was created with. */
  readonly seed: number;
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** True with the given probability (0..1). */
  chance(probability: number): boolean;
  /** One element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** A shuffled copy (Fisher-Yates); the input is not modified. */
  shuffle<T>(items: readonly T[]): T[];
  /** One element chosen with probability proportional to its weight. */
  weightedPick<T>(items: readonly T[], weight: (item: T) => number): T;
  /** A version-4-shaped UUID derived from the sequence. */
  uuid(): string;
}

export const MAX_SEED = 0xffffffff;

export function isValidSeed(seed: number): boolean {
  return Number.isInteger(seed) && seed >= 0 && seed <= MAX_SEED;
}

/** Mulberry32: small, fast 32-bit generator with a good distribution. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeededRandom(seed: number): SeededRandom {
  if (!isValidSeed(seed)) {
    throw new RangeError(`Seed must be an integer between 0 and ${MAX_SEED}, got ${seed}`);
  }
  const next = mulberry32(seed);

  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Invalid integer range [${min}, ${max}]`);
    }
    return min + Math.floor(next() * (max - min + 1));
  };

  const pick = <T>(items: readonly T[]): T => {
    const item = items[int(0, items.length - 1)];
    if (item === undefined) {
      throw new RangeError('Cannot pick from an empty array');
    }
    return item;
  };

  return {
    seed,
    next,
    int,
    chance: (probability) => next() < probability,
    pick,
    shuffle<T>(items: readonly T[]): T[] {
      const result = [...items];
      for (let i = result.length - 1; i > 0; i -= 1) {
        const j = int(0, i);
        [result[i], result[j]] = [result[j] as T, result[i] as T];
      }
      return result;
    },
    weightedPick<T>(items: readonly T[], weight: (item: T) => number): T {
      const total = items.reduce((sum, item) => sum + Math.max(0, weight(item)), 0);
      if (total <= 0) {
        return pick(items);
      }
      let threshold = next() * total;
      for (const item of items) {
        threshold -= Math.max(0, weight(item));
        if (threshold < 0) {
          return item;
        }
      }
      return pick(items);
    },
    uuid() {
      const hex = Array.from({ length: 32 }, () => int(0, 15).toString(16));
      hex[12] = '4';
      hex[16] = ((int(0, 15) & 0x3) | 0x8).toString(16);
      const s = hex.join('');
      return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
    },
  };
}
