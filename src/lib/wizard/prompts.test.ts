/**
 * Tests for wizard prompts — mocks @inquirer/prompts to assert wiring.
 */

jest.mock('@inquirer/prompts', () => ({
  checkbox: jest.fn(),
  confirm: jest.fn(),
  select: jest.fn(),
}));

import { checkbox, confirm, select } from '@inquirer/prompts';
import { askAiClients, askGitConnect, askMergeStrategy, askOllamaModel } from './prompts';

beforeEach(() => {
  (checkbox as jest.Mock).mockReset();
  (confirm as jest.Mock).mockReset();
  (select as jest.Mock).mockReset();
});

describe('askAiClients', () => {
  it('passes all five clients and returns selection', async () => {
    (checkbox as jest.Mock).mockResolvedValue(['copilot', 'cursor']);
    const result = await askAiClients();
    expect(result).toEqual(['copilot', 'cursor']);
    const opts = (checkbox as jest.Mock).mock.calls[0][0] as { choices: Array<{ value: string }> };
    expect(opts.choices.map((c) => c.value)).toEqual([
      'copilot',
      'continue-ollama',
      'continue-anthropic',
      'claude-code',
      'cursor',
    ]);
  });
});

describe('askGitConnect', () => {
  it('confirms with default false', async () => {
    (confirm as jest.Mock).mockResolvedValue(false);
    await askGitConnect();
    const opts = (confirm as jest.Mock).mock.calls[0][0];
    expect(opts.default).toBe(false);
  });
});

describe('askMergeStrategy', () => {
  it('offers merge/overwrite/skip with default merge', async () => {
    (select as jest.Mock).mockResolvedValue('merge');
    await askMergeStrategy('.vscode/mcp.json');
    const opts = (select as jest.Mock).mock.calls[0][0] as {
      choices: Array<{ value: string }>;
      default: string;
    };
    expect(opts.choices.map((c) => c.value)).toEqual(['merge', 'overwrite', 'skip']);
    expect(opts.default).toBe('merge');
  });
});

describe('askOllamaModel', () => {
  afterEach(() => {
    (select as jest.Mock).mockReset();
  });

  it('recommends tiny model for low RAM', async () => {
    (select as jest.Mock).mockResolvedValue('qwen2.5-coder:1.5b');
    await askOllamaModel(4);
    const opts = (select as jest.Mock).mock.calls[0][0];
    expect(opts.default).toBe('qwen2.5-coder:1.5b');
  });

  it('recommends 7b for mid RAM', async () => {
    (select as jest.Mock).mockResolvedValue('qwen2.5-coder:7b');
    await askOllamaModel(12);
    const opts = (select as jest.Mock).mock.calls[0][0];
    expect(opts.default).toBe('qwen2.5-coder:7b');
  });

  it('recommends 14b for high RAM', async () => {
    (select as jest.Mock).mockResolvedValue('qwen2.5-coder:14b');
    await askOllamaModel(32);
    const opts = (select as jest.Mock).mock.calls[0][0];
    expect(opts.default).toBe('qwen2.5-coder:14b');
  });
});
