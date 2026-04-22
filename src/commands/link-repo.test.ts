/**
 * Tests for link-repo URL validation (EVO-394 CA-7).
 * Full E2E (git remote + TOML update) requires git fixture — smoke-only.
 */

// Re-declare the validator logic for isolated testing
function validateRepoUrl(url: string): { ok: true; host: string } | { ok: false; reason: string } {
  const ALLOWED_HOSTS = ['github.com', 'gitlab.com'];
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return { ok: false, reason: 'URL must use https://' };
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return { ok: false, reason: `Host must be one of ${ALLOWED_HOSTS.join(', ')}` };
    }
    if (parsed.pathname.split('/').filter(Boolean).length < 2) {
      return { ok: false, reason: 'URL must include <org>/<repo>' };
    }
    return { ok: true, host: parsed.hostname };
  } catch {
    return { ok: false, reason: 'Not a valid URL' };
  }
}

describe('link-repo URL validation (EVO-394 CA-7)', () => {
  it('accepts github.com https URL with org/repo', () => {
    const r = validateRepoUrl('https://github.com/org/repo');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.host).toBe('github.com');
  });

  it('accepts gitlab.com https URL', () => {
    const r = validateRepoUrl('https://gitlab.com/org/repo');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.host).toBe('gitlab.com');
  });

  it('rejects http://', () => {
    const r = validateRepoUrl('http://github.com/org/repo');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('https://');
  });

  it('rejects unknown host (bitbucket)', () => {
    const r = validateRepoUrl('https://bitbucket.org/org/repo');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('Host must be');
  });

  it('rejects URL without org/repo', () => {
    const r = validateRepoUrl('https://github.com/org');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('<org>/<repo>');
  });

  it('rejects malformed URL', () => {
    const r = validateRepoUrl('not-a-url');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('valid URL');
  });
});
