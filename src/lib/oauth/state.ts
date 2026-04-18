/**
 * OAuth CSRF state — cryptographically random state + constant-time compare.
 * @package @fluxomind/cli
 */

import { randomBytes, timingSafeEqual } from 'crypto';

const STATE_BYTE_LENGTH = 16;

export function generateState(): string {
  return randomBytes(STATE_BYTE_LENGTH).toString('hex');
}

export function validateState(received: string, expected: string): boolean {
  if (typeof received !== 'string' || typeof expected !== 'string') return false;
  if (received.length !== expected.length) return false;
  const a = Buffer.from(received, 'utf-8');
  const b = Buffer.from(expected, 'utf-8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
