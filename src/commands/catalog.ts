import { Command, InvalidArgumentError } from 'commander';
import { print } from '../lib/output';
export function catalogCommand(root: Command): Command {
  return new Command('catalog').description('Offline machine-readable command reference; no authentication or HTTP calls')
    .argument('[command...]', 'Command path, for example workflow run')
    .option('--full', 'Include per-command help and all descendants')
    .action((path: string[], opts: { full?: boolean }) => {
      let command = root;
      for (const part of path) { const next = command.commands.find(c => c.name() === part); if (!next) throw new InvalidArgumentError(`Unknown command: ${part}. Use fmx catalog`); command = next; }
      function describe(c: Command): unknown {
        return { name: c.name(), description: c.description(), arguments: c.registeredArguments.map(a => ({ name: a.name(), required: a.required, variadic: a.variadic })), options: c.options.map(o => ({ flags: o.flags, description: o.description, mandatory: o.mandatory, ...(o.defaultValue !== undefined ? { default: o.defaultValue } : {}) })), ...(opts.full ? { help: c.helpInformation(), commands: c.commands.map(describe) } : { commands: c.commands.map(child => ({ name: child.name(), description: child.description() })) }) };
      }
      print({ source: 'local-cli', command: describe(command), help: opts.full ? undefined : `fmx catalog ${path.join(' ')} --full`.replace(/ +/g, ' ') });
    });
}
