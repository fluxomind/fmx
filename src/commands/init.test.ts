import { vi, type MockedFunction } from 'vitest';
/**
 * Tests for `fmx init` — DX-first templates (GAP-178)
 */

vi.mock('../lib/api-client', () => ({
  post: vi.fn(),
  AuthError: class AuthError extends Error {},
  ServerError: class ServerError extends Error {
    constructor(message: string, public statusCode: number) {
      super(message);
      this.name = 'ServerError';
    }
  },
  NetworkError: class NetworkError extends Error {},
}));

vi.mock('../lib/output', () => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  dim: (s: string) => s,
  bold: (s: string) => s,
}));

vi.mock('readline/promises', () => ({
  createInterface: vi.fn(),
}));

import {
  GITIGNORE_TEMPLATE,
  README_TEMPLATE,
  README_PLACEHOLDER,
  renderReadme,
  confirmPublicVisibility,
} from './init';
import * as readline from 'readline/promises';

const mockCreateInterface = readline.createInterface as MockedFunction<
  typeof readline.createInterface
>;

describe('GITIGNORE_TEMPLATE', () => {
  it('covers env variable globs (.env.* and negation .env.example)', () => {
    expect(GITIGNORE_TEMPLATE).toMatch(/^\.env$/m);
    expect(GITIGNORE_TEMPLATE).toMatch(/^\.env\.\*$/m);
    expect(GITIGNORE_TEMPLATE).toMatch(/^!\.env\.example$/m);
  });

  it('covers Fluxomind CLI local state (.fmx/)', () => {
    expect(GITIGNORE_TEMPLATE).toMatch(/^\.fmx\/$/m);
  });

  it('covers TLS/credential files (*.pem, *.key, *.crt, *.p12, *.pfx)', () => {
    expect(GITIGNORE_TEMPLATE).toMatch(/^\*\.pem$/m);
    expect(GITIGNORE_TEMPLATE).toMatch(/^\*\.key$/m);
    expect(GITIGNORE_TEMPLATE).toMatch(/^\*\.crt$/m);
    expect(GITIGNORE_TEMPLATE).toMatch(/^\*\.p12$/m);
    expect(GITIGNORE_TEMPLATE).toMatch(/^\*\.pfx$/m);
  });

  it('covers AI client local caches (.continue/.cache/, .claude/.cache/)', () => {
    expect(GITIGNORE_TEMPLATE).toMatch(/^\.continue\/\.cache\/$/m);
    expect(GITIGNORE_TEMPLATE).toMatch(/^\.claude\/\.cache\/$/m);
  });

  it('covers OS-specific artifacts (.DS_Store, Thumbs.db)', () => {
    expect(GITIGNORE_TEMPLATE).toMatch(/^\.DS_Store$/m);
    expect(GITIGNORE_TEMPLATE).toMatch(/^Thumbs\.db$/m);
  });

  it('covers build artifacts (node_modules/, dist/, build/)', () => {
    expect(GITIGNORE_TEMPLATE).toMatch(/^node_modules\/$/m);
    expect(GITIGNORE_TEMPLATE).toMatch(/^dist\/$/m);
    expect(GITIGNORE_TEMPLATE).toMatch(/^build\/$/m);
  });
});

describe('README_TEMPLATE', () => {
  it('contains Security Recommendations section', () => {
    expect(README_TEMPLATE).toContain('## Security Recommendations');
  });

  it('links the 4 canonical GitHub governance features', () => {
    const branchProtectionUrl =
      'https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches';
    const dependabotUrl =
      'https://docs.github.com/en/code-security/dependabot/dependabot-alerts/about-dependabot-alerts';
    const secretScanningUrl =
      'https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning';
    const tagProtectionUrl =
      'https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-tag-protection-rules';

    expect(README_TEMPLATE).toContain(branchProtectionUrl);
    expect(README_TEMPLATE).toContain(dependabotUrl);
    expect(README_TEMPLATE).toContain(secretScanningUrl);
    expect(README_TEMPLATE).toContain(tagProtectionUrl);
  });

  it('makes clear Fluxomind does not enforce governance', () => {
    expect(README_TEMPLATE).toMatch(/Fluxomind does not enforce/);
  });

  it('mentions default visibility: private', () => {
    expect(README_TEMPLATE).toMatch(/visibility.*private/);
  });
});

describe('renderReadme()', () => {
  it('substitutes placeholder with extension name', () => {
    const rendered = renderReadme('my-awesome-ext');
    expect(rendered).toContain('my-awesome-ext');
    expect(rendered).not.toContain(README_PLACEHOLDER);
  });
});

describe('confirmPublicVisibility()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects public visibility in non-interactive (CI) environments', async () => {
    const confirmed = await confirmPublicVisibility(false);
    expect(confirmed).toBe(false);
    expect(mockCreateInterface).not.toHaveBeenCalled();
  });

  it('returns true when user answers "y"', async () => {
    const questionMock = vi.fn().mockResolvedValue('y');
    const closeMock = vi.fn();
    mockCreateInterface.mockReturnValue({ question: questionMock, close: closeMock } as unknown as ReturnType<typeof readline.createInterface>);

    const confirmed = await confirmPublicVisibility(true);
    expect(confirmed).toBe(true);
    expect(closeMock).toHaveBeenCalled();
  });

  it('returns false when user answers "n" or empty', async () => {
    const questionMock = vi.fn().mockResolvedValue('n');
    const closeMock = vi.fn();
    mockCreateInterface.mockReturnValue({ question: questionMock, close: closeMock } as unknown as ReturnType<typeof readline.createInterface>);

    const confirmed = await confirmPublicVisibility(true);
    expect(confirmed).toBe(false);
  });

  it('case-insensitive on "Y"', async () => {
    const questionMock = vi.fn().mockResolvedValue('Y');
    const closeMock = vi.fn();
    mockCreateInterface.mockReturnValue({ question: questionMock, close: closeMock } as unknown as ReturnType<typeof readline.createInterface>);

    const confirmed = await confirmPublicVisibility(true);
    expect(confirmed).toBe(true);
  });

  it('returns false when user presses enter (empty string)', async () => {
    const questionMock = vi.fn().mockResolvedValue('');
    const closeMock = vi.fn();
    mockCreateInterface.mockReturnValue({ question: questionMock, close: closeMock } as unknown as ReturnType<typeof readline.createInterface>);

    const confirmed = await confirmPublicVisibility(true);
    expect(confirmed).toBe(false);
  });
});
