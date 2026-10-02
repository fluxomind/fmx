const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { version } = require('../package.json');
const { guidance } = require('../dist/lib/home.js');
const root = path.resolve(__dirname, '..');
const binary = path.join(root, 'dist/bin.js');
const installedVersion = execFileSync(process.execPath, [binary, '--version'], { encoding: 'utf8' }).trim();
if (installedVersion !== version) throw new Error('Build the CLI before generating its versioned skill.');
// Catalog is offline and comes from the same registered commands/schemas as execution.
const catalog = JSON.parse(execFileSync(process.execPath, [binary, '--format', 'json', 'catalog', '--full'], {
  cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
}));
const invocation = 'npx -y @fluxomind/cli@' + version;
const template = fs.readFileSync(path.join(__dirname, 'skill-template.md'), 'utf8');
const content = template.replaceAll('{{version}}', version).replaceAll('{{invocation}}', invocation);
const code = value => '`' + String(value).replaceAll('`', '\\`') + '`';
function options(items) {
  return items.map(option => '- ' + code(option.flags) + ': ' + option.description
    + (Object.hasOwn(option, 'default') ? ' Default: ' + code(JSON.stringify(option.default)) + '.' : '')
    + (option.mandatory ? ' Required.' : '')).join('\n');
}
function render(command, ancestors = []) {
  const parts = [...ancestors, command.name];
  const args = command.arguments.map(arg => {
    const name = arg.name + (arg.variadic ? '...' : '');
    return arg.required ? '<' + name + '>' : '[' + name + ']';
  });
  const usage = ['fmx', ...parts, ...args, ...(command.options.length ? ['[options]'] : [])].join(' ');
  const examples = command.help?.split('\nExamples:\n')[1]?.trim();
  return '## ' + parts.join(' ') + '\n\n' + command.description + '\n\n```sh\n' + usage + '\n```\n\n'
    + (command.options.length ? options(command.options) + '\n\n' : '')
    + (command.contract ? 'Declared contract (local CLI; server authorization remains authoritative):\n\n```json\n'
      + JSON.stringify(command.contract, null, 2) + '\n```\n\n' : '')
    + (examples ? 'Examples from command help:\n\n```sh\n' + examples + '\n```\n\n' : '')
    + command.commands.map(child => render(child, parts)).join('');
}
const outputs = new Map([['SKILL.md', content]]);
const groups = catalog.command.commands;
const index = '# CLI reference — ' + version + '\n\n'
  + 'Generated from the offline command catalog. Read only the group/section needed for the task. '
  + 'Examples use `fmx` as shorthand for the executable selected in SKILL.md. '
  + 'Placeholders must come from user intent or observed results. A listed command does not establish permission to run it.\n\n'
  + '## Global options\n\n' + options(catalog.globalOptions) + '\n\n'
  + '## All command groups\n\n'
  + groups.map(group => '- [' + code(group.name) + '](catalog/' + group.name + '.md): ' + group.description).join('\n')
  + '\n\n## Starting points from the CLI home\n\n'
  + 'These suggestions share the CLI home source. Suggested writes and setup are not automatic bootstrap steps.\n\n'
  + guidance.map(command => '- ' + code(command)).join('\n') + '\n';
outputs.set('references/commands.md', index);
for (const group of groups) {
  if (!/^[a-z][a-z0-9-]*$/.test(group.name)) throw new Error('Invalid command group name: ' + group.name);
  outputs.set('references/catalog/' + group.name + '.md', '# ' + group.name + ' — CLI ' + version
    + '\n\nGenerated from `fmx catalog ' + group.name + ' --full`. [Global options and other groups](../commands.md). '
    + 'Use the executable selected in SKILL.md. Read only the relevant command section.\n\n' + render(group));
}
const check = process.argv.includes('--check');
const skillRoot = path.join(root, 'skills/fmx');
for (const [relative, generated] of outputs) {
  const target = path.join(skillRoot, relative);
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== generated) {
      console.error('FMX skill is stale: ' + relative + '. Run npm run build:cli && npm run skill:generate.');
      process.exitCode = 1;
    }
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, generated);
  }
}
const catalogDir = path.join(skillRoot, 'references/catalog');
if (fs.existsSync(catalogDir)) {
  for (const file of fs.readdirSync(catalogDir)) {
    if (!file.endsWith('.md') || outputs.has('references/catalog/' + file)) continue;
    if (check) {
      console.error('FMX skill has an obsolete generated catalog: ' + file);
      process.exitCode = 1;
    } else fs.unlinkSync(path.join(catalogDir, file));
  }
}
