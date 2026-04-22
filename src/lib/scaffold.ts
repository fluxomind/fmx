/**
 * Scaffold helper — creates a new extension project by recursive-copying
 * `templates/scaffold/` (packaged alongside the CLI) and substituting
 * `{EXTENSION_NAME}` placeholders in text files.
 *
 * Shared between:
 *   - `fmx init` (src/commands/init.ts) — CLI command
 *   - MCP scaffold-adapter (monorepo) — MCP tool `codeengine_scaffold`
 *
 * Pure filesystem operation — no HTTP, no token required. Idempotency guarded by
 * `existsSync(targetDir)` unless `force: true`.
 *
 * EVO-394 CA-13 + Task 10.6: copy recursivo (não geração programática de strings)
 *
 * @package @fluxomind/cli (local helper)
 */

import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative, resolve } from 'path';

export type TemplateKind = 'extension' | 'trigger' | 'module';

export interface CreateProjectInput {
  /** Project name — must be kebab-case [a-z][a-z0-9]*(-[a-z0-9]+)* */
  name: string;
  /** Project template kind (reserved for future use; currently all kinds use same scaffold) */
  type: TemplateKind;
  /** Parent directory where `<name>/` will be created (default: process.cwd()) */
  targetDir?: string;
  /** If true, skip existsSync check (overwrites). Default false. */
  force?: boolean;
}

export interface CreateProjectResult {
  path: string;
  files: string[];
}

export class ScaffoldError extends Error {
  readonly code: 'INVALID_NAME' | 'INVALID_TYPE' | 'DIR_EXISTS' | 'WRITE_FAILED' | 'TEMPLATE_MISSING';

  constructor(code: ScaffoldError['code'], message: string) {
    super(message);
    this.name = 'ScaffoldError';
    this.code = code;
  }
}

export const README_PLACEHOLDER = '{EXTENSION_NAME}';

/**
 * Resolve the packaged `templates/scaffold/` directory. In dev (tsc + ts-jest) this
 * file lives at `src/lib/scaffold.ts`; in published npm, it lives at
 * `dist/lib/scaffold.js`. Both resolve to `<package>/templates/scaffold` via `../../`.
 */
function resolveTemplateRoot(): string {
  const candidate = resolve(__dirname, '..', '..', 'templates', 'scaffold');
  if (!existsSync(candidate)) {
    throw new ScaffoldError(
      'TEMPLATE_MISSING',
      `Template root not found at ${candidate}. Ensure 'templates/' is included in the published package.`,
    );
  }
  return candidate;
}

/**
 * Text file extensions that undergo placeholder substitution. Binary files
 * (if ever added) are copied as-is by cpSync.
 */
const TEXT_EXTENSIONS = new Set([
  '.md', '.json', '.toml', '.yml', '.yaml', '.ts', '.tsx', '.js', '.jsx',
  '.txt', '.gitignore', '.gitkeep', 'CODEOWNERS', '.env', '.example',
]);

const TEXT_BASENAMES = new Set(['CODEOWNERS', '.gitignore', '.gitkeep']);

function isTextFile(filePath: string): boolean {
  const base = filePath.split('/').pop() ?? '';
  if (TEXT_BASENAMES.has(base)) return true;
  const dotIdx = base.lastIndexOf('.');
  if (dotIdx < 0) return false;
  const ext = base.slice(dotIdx);
  return TEXT_EXTENSIONS.has(ext);
}

function substitutePlaceholders(content: string, name: string): string {
  return content.split(README_PLACEHOLDER).join(name);
}

/**
 * Walk all files inside `dir` recursively; return absolute paths.
 */
function walkFiles(dir: string): string[] {
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = readdirSync(current);
    for (const entry of entries) {
      const full = join(current, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        stack.push(full);
      } else {
        out.push(full);
      }
    }
  }
  return out;
}

/**
 * Load the packaged README template and substitute `{EXTENSION_NAME}`.
 * Kept for backwards compatibility with existing tests/imports.
 */
export function renderReadme(name: string): string {
  const templatePath = join(resolveTemplateRoot(), 'README.md');
  return substitutePlaceholders(readFileSync(templatePath, 'utf-8'), name);
}

/**
 * `README_TEMPLATE` constant — resolved lazily from the packaged template file
 * to keep tests self-contained and the template single-source-of-truth.
 */
export const README_TEMPLATE: string = (() => {
  try {
    return readFileSync(join(resolveTemplateRoot(), 'README.md'), 'utf-8');
  } catch {
    return '';
  }
})();

/**
 * `GITIGNORE_TEMPLATE` constant — same lazy-load pattern as README_TEMPLATE.
 */
export const GITIGNORE_TEMPLATE: string = (() => {
  try {
    return readFileSync(join(resolveTemplateRoot(), '.gitignore'), 'utf-8');
  } catch {
    return '';
  }
})();

export function isKebabCase(name: string): boolean {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name);
}

export function isValidTemplateKind(value: string): value is TemplateKind {
  return value === 'extension' || value === 'trigger' || value === 'module';
}

/**
 * Create a new project on disk by recursive-copying the packaged template
 * and substituting `{EXTENSION_NAME}` in text files.
 *
 * Idempotent: fails if targetDir/name exists unless `force: true`.
 */
export function createProject(input: CreateProjectInput): CreateProjectResult {
  if (!isKebabCase(input.name)) {
    throw new ScaffoldError(
      'INVALID_NAME',
      `Invalid project name "${input.name}". Use kebab-case (e.g., my-extension).`,
    );
  }

  if (!isValidTemplateKind(input.type)) {
    throw new ScaffoldError(
      'INVALID_TYPE',
      `Invalid template type "${input.type}". Use: extension, trigger, module.`,
    );
  }

  const parentDir = input.targetDir ?? process.cwd();
  const projectDir = join(parentDir, input.name);

  if (existsSync(projectDir) && !input.force) {
    throw new ScaffoldError('DIR_EXISTS', `Directory "${input.name}" already exists.`);
  }

  try {
    const templateRoot = resolveTemplateRoot();

    // Recursive copy preserves hidden files (.github, .gitignore) and empty dirs.
    cpSync(templateRoot, projectDir, { recursive: true, force: !!input.force });

    // Substitute {EXTENSION_NAME} in every text file of the project.
    const allFiles = walkFiles(projectDir);
    const writtenPaths: string[] = [];
    for (const absPath of allFiles) {
      const relPath = relative(projectDir, absPath);
      writtenPaths.push(relPath);
      if (!isTextFile(absPath)) continue;
      const original = readFileSync(absPath, 'utf-8');
      if (!original.includes(README_PLACEHOLDER)) continue;
      writeFileSync(absPath, substitutePlaceholders(original, input.name), 'utf-8');
    }

    return { path: projectDir, files: writtenPaths.sort() };
  } catch (err) {
    if (err instanceof ScaffoldError) throw err;
    throw new ScaffoldError(
      'WRITE_FAILED',
      `Failed to scaffold project: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Back-compat exports — keep scaffold-adapter (monorepo) and init.test.ts working.
// ---------------------------------------------------------------------------

export interface TemplateFile {
  path: string;
  content: string;
}

/**
 * @deprecated prefer `createProject()` — this helper enumerates what a
 * scaffold would produce without writing to disk. Kept for the MCP adapter
 * that may use it for dry-run previews.
 */
export function buildTemplateFiles(name: string, _kind: TemplateKind): TemplateFile[] {
  const templateRoot = resolveTemplateRoot();
  const allFiles = walkFiles(templateRoot);
  return allFiles.map((abs) => {
    const relPath = relative(templateRoot, abs);
    const raw = readFileSync(abs, 'utf-8');
    const content = isTextFile(abs) && raw.includes(README_PLACEHOLDER)
      ? substitutePlaceholders(raw, name)
      : raw;
    return { path: relPath, content };
  });
}
