import { describe, expect, it } from 'vitest';
import { isApiResponse } from './apiResponse.js';

describe('isApiResponse', () => {
  it('accepts a success envelope', () => {
    expect(isApiResponse({ success: true, data: { id: 1 } })).toBe(true);
    expect(isApiResponse({ success: true, data: null, message: 'Created' })).toBe(true);
  });

  it('accepts a failure envelope', () => {
    expect(isApiResponse({ success: false, data: null, message: 'Not found' })).toBe(true);
  });

  it('rejects values without the envelope shape', () => {
    expect(isApiResponse(null)).toBe(false);
    expect(isApiResponse('ok')).toBe(false);
    expect(isApiResponse({ data: 1 })).toBe(false);
    expect(isApiResponse({ success: true })).toBe(false);
  });

  it('rejects failures that carry data or lack a message', () => {
    expect(isApiResponse({ success: false, data: { id: 1 }, message: 'x' })).toBe(false);
    expect(isApiResponse({ success: false, data: null })).toBe(false);
  });
});
