import { describe, expect, it } from 'vitest';
import { etagMatches } from './etag.js';

describe('etagMatches', () => {
  it('matches the same tag, weak or strong, in a list or as "*"', () => {
    expect(etagMatches('"abc"', '"abc"')).toBe(true);
    expect(etagMatches('W/"abc"', '"abc"')).toBe(true);
    expect(etagMatches('"x", "abc"', '"abc"')).toBe(true);
    expect(etagMatches('*', '"abc"')).toBe(true);
  });

  it('does not match a different or missing tag', () => {
    expect(etagMatches('"abd"', '"abc"')).toBe(false);
    expect(etagMatches(undefined, '"abc"')).toBe(false);
    expect(etagMatches('', '"abc"')).toBe(false);
  });
});
