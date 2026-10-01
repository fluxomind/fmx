import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { InvalidArgumentError } from 'commander';
import { z } from 'zod';
export const projectContextSchema = z.strictObject({ tenant: z.uuid(), environment: z.enum(['development', 'test', 'production']), app: z.uuid().optional(), liveContext: z.boolean().optional() });
export function projectContext(start = process.cwd()): ({ path: string } & z.infer<typeof projectContextSchema>) | undefined {
  let directory = resolve(start);
  while (true) {
    const path = join(directory, '.fmx', 'project.json');
    if (existsSync(path)) {
      let input: unknown; try { input = JSON.parse(readFileSync(path, 'utf8')); } catch { throw new InvalidArgumentError(`Invalid project context: ${path}`); }
      const parsed = projectContextSchema.safeParse(input);
      if (!parsed.success) throw new InvalidArgumentError(`Invalid project context: ${path}. Expected tenant UUID and environment; credentials do not belong here.`);
      return { path, ...parsed.data };
    }
    const parent = dirname(directory); if (parent === directory) return undefined; directory = parent;
  }
}
