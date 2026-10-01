import { vi, type MockedFunction } from 'vitest';
import { get, post } from '../lib/api-client';
import { logsCommand } from './logs';
import { rollbackCommand } from './rollback';
import { statusCommand } from './status';

vi.mock('../lib/api-client', () => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../lib/output', () => ({
  print: vi.fn(),
  configureOutput: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  dim: (value: string) => value,
  table: vi.fn(),
  supportsColor: () => false,
  isInteractive: () => false,
}));

const mockedGet = get as MockedFunction<typeof get>;
const mockedPost = post as MockedFunction<typeof post>;

describe('CodeEngine CLI HTTP contract — BUG-350', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    for (const option of ['list', 'force', 'json', 'deployment', 'extension']) {
      rollbackCommand.setOptionValue(option, undefined);
    }
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('status uses the explicit extension reference', async () => {
    mockedGet.mockResolvedValue({
      name: 'Project A', version: '1.1.0', status: 'active', triggers: 1,
      executions24h: 2, lastExecution: null,
      metrics: { latencyP50: 1, latencyP95: 2, latencyP99: 3, memoryMB: 4 },
    });

    await statusCommand.parseAsync(['node', 'status', 'project-a']);

    expect(mockedGet).toHaveBeenCalledWith('/api/code-engine/extensions/project-a');
  });

  it('rollback list reads the compatible versions array', async () => {
    mockedGet.mockResolvedValue([{ version: '1.0.0', status: 'superseded', deployedAt: 'now', deployedBy: 'user-a' }]);

    await rollbackCommand.parseAsync(['node', 'rollback', '--list', '--extension', 'project-a']);

    expect(mockedGet).toHaveBeenCalledWith('/api/code-engine/extensions/project-a/versions');
  });

  it('rollback posts exactly one target to the explicit extension', async () => {
    mockedPost.mockResolvedValue({ version: '1.0.0', previousVersion: '1.1.0', duration: 1 });

    await rollbackCommand.parseAsync(['node', 'rollback', '1.0.0', '--force', '--extension', 'project-a']);

    expect(mockedPost).toHaveBeenCalledWith('/api/code-engine/extensions/project-a/rollback', { version: '1.0.0' });
  });

  it('logs consumes the array returned by the backend route', async () => {
    mockedGet.mockResolvedValue([{ timestamp: 'now', level: 'info', message: 'real' }]);

    await logsCommand.parseAsync(['node', 'logs', 'project-a']);

    expect(mockedGet).toHaveBeenCalledWith(expect.stringContaining('/api/code-engine/logs?extensionId=project-a'));
  });
});
