/**
 * Tests for non-interactive flag parsing.
 */

import { parseAiClientsCsv } from './flags';

describe('parseAiClientsCsv', () => {
  it('returns empty array when undefined', () => {
    expect(parseAiClientsCsv(undefined)).toEqual([]);
  });

  it('parses single client', () => {
    expect(parseAiClientsCsv('copilot')).toEqual(['copilot']);
  });

  it('parses CSV and trims whitespace', () => {
    expect(parseAiClientsCsv(' copilot , cursor ,claude-code')).toEqual([
      'copilot',
      'cursor',
      'claude-code',
    ]);
  });

  it('deduplicates', () => {
    expect(parseAiClientsCsv('copilot,copilot,cursor')).toEqual(['copilot', 'cursor']);
  });

  it('throws on unknown client', () => {
    expect(() => parseAiClientsCsv('copilot,bogus')).toThrow(/Unknown AI client/);
  });

  it('throws on empty after dedup', () => {
    expect(() => parseAiClientsCsv(' , , ')).toThrow(/empty/);
  });
});
