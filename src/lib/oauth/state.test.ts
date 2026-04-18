import { generateState, validateState } from './state';

describe('oauth/state', () => {
  describe('generateState', () => {
    it('returns a 32-character lowercase hex string', () => {
      const state = generateState();
      expect(state).toMatch(/^[0-9a-f]{32}$/);
    });

    it('returns distinct values across calls', () => {
      const values = new Set(Array.from({ length: 64 }, () => generateState()));
      expect(values.size).toBe(64);
    });
  });

  describe('validateState', () => {
    it('accepts an exact match', () => {
      const state = generateState();
      expect(validateState(state, state)).toBe(true);
    });

    it('rejects a mismatch of same length', () => {
      const expected = generateState();
      const received = generateState();
      expect(validateState(received, expected)).toBe(false);
    });

    it('rejects mismatched lengths', () => {
      expect(validateState('abc', 'abcd')).toBe(false);
    });

    it('rejects non-string inputs defensively', () => {
      expect(validateState(undefined as unknown as string, 'abc')).toBe(false);
      expect(validateState('abc', null as unknown as string)).toBe(false);
    });
  });
});
