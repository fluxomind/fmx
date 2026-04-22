/**
 * MCP Server Rate Limiter.
 * Sliding window rate limiting per user/tool.
 * Limits configurable per tool, overridable via env MCP_RATE_LIMIT_<TOOL>=<value>.
 */

import { DEFAULT_RATE_LIMITS, type RateLimitConfig, type McpServiceResult } from '../types';

interface RateLimitEntry {
  timestamps: number[];
}

/** In-memory rate limiter for MCP tool calls */
export class RateLimiter {
  private readonly buckets = new Map<string, RateLimitEntry>();
  private readonly limits: Record<string, RateLimitConfig>;

  constructor(overrides?: Record<string, RateLimitConfig>) {
    this.limits = { ...DEFAULT_RATE_LIMITS, ...overrides };
    this.applyEnvOverrides();
  }

  /** Check if the call is allowed; if not, return retryAfterMs */
  check(toolName: string, userId: string): McpServiceResult<{ retryAfterMs?: number }> {
    const config = this.limits[toolName];
    if (!config) {
      return { success: true, data: {} };
    }

    const key = `${toolName}:${userId}`;
    const now = Date.now();
    const entry = this.buckets.get(key) ?? { timestamps: [] };

    // Prune expired timestamps
    const windowStart = now - config.windowMs;
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    if (entry.timestamps.length >= config.maxCalls) {
      const oldestInWindow = entry.timestamps[0];
      const retryAfterMs = oldestInWindow + config.windowMs - now;
      return {
        success: false,
        error: `Rate limit exceeded for tool '${toolName}'. Retry after ${Math.ceil(retryAfterMs / 1000)}s`,
        errorDetails: {
          code: 'RATE_LIMIT_EXCEEDED',
          toolName,
          retryAfterMs,
          retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
        },
      };
    }

    entry.timestamps.push(now);
    this.buckets.set(key, entry);
    return { success: true, data: {} };
  }

  /** Reset rate limits (for testing) */
  reset(): void {
    this.buckets.clear();
  }

  private applyEnvOverrides(): void {
    for (const toolName of Object.keys(this.limits)) {
      const envKey = `MCP_RATE_LIMIT_${toolName.replace('.', '_').toUpperCase()}`;
      const envValue = process.env[envKey];
      if (envValue) {
        const maxCalls = parseInt(envValue, 10);
        if (!isNaN(maxCalls) && maxCalls > 0) {
          this.limits[toolName] = { ...this.limits[toolName], maxCalls };
        }
      }
    }
  }
}
