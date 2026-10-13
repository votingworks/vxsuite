import { execFile as execFileCallback } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { range } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { beforeEach, expect, test, vi } from 'vitest';
import { execFile } from '../exec.js';
import { intermediateScript } from '../intermediate_scripts.js';
import {
  getLifetimeSheetCountFilePath,
  incrementLifetimeSheetCount,
} from './increment_lifetime_sheet_count.js';

vi.mock(
  import('../exec.js'),
  async (importActual): Promise<typeof import('../exec.js')> => ({
    ...(await importActual()),
    execFile: vi.fn(),
  })
);

const execMock = vi.mocked(execFile);
const SCRIPT_PATH_MATCHER = expect.stringMatching(
  /^\/.*\/libs\/backend\/intermediate-scripts\/increment-lifetime-sheet-count$/
);

beforeEach(() => {
  execMock.mockReset();
  vi.unstubAllEnvs();
});

function stubProductionEnv(): void {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VX_CONFIG_ROOT', '/vx/config');
}

test('getLifetimeSheetCountFilePath uses VX_CONFIG_ROOT in production', () => {
  stubProductionEnv();
  expect(getLifetimeSheetCountFilePath({ devRoot: '/dev-root' })).toEqual(
    '/vx/config/lifetime-sheet-count'
  );
});

test('getLifetimeSheetCountFilePath requires VX_CONFIG_ROOT in production', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VX_CONFIG_ROOT', undefined);
  expect(() => getLifetimeSheetCountFilePath({ devRoot: '/dev-root' })).toThrow(
    'Missing required VX_CONFIG_ROOT env var'
  );
});

test('getLifetimeSheetCountFilePath uses devRoot outside production', () => {
  vi.stubEnv('VX_CONFIG_ROOT', '/vx/config');
  expect(getLifetimeSheetCountFilePath({ devRoot: '/dev-root' })).toEqual(
    '/dev-root/lifetime-sheet-count'
  );
});

test('getLifetimeSheetCountFilePath uses devRoot in integration tests', () => {
  stubProductionEnv();
  vi.stubEnv('IS_INTEGRATION_TEST', 'true');
  expect(getLifetimeSheetCountFilePath({ devRoot: '/dev-root' })).toEqual(
    '/dev-root/lifetime-sheet-count'
  );
});

test('incrementLifetimeSheetCount runs the script via sudo in production', async () => {
  stubProductionEnv();
  await incrementLifetimeSheetCount({ devRoot: '/dev-root' });
  expect(execMock).toHaveBeenCalledExactlyOnceWith('sudo', [
    SCRIPT_PATH_MATCHER,
    '/vx/config/lifetime-sheet-count',
  ]);
});

test('incrementLifetimeSheetCount runs the script directly outside production', async () => {
  await incrementLifetimeSheetCount({ devRoot: '/dev-root' });
  expect(execMock).toHaveBeenCalledExactlyOnceWith(SCRIPT_PATH_MATCHER, [
    '/dev-root/lifetime-sheet-count',
  ]);
});

test('incrementLifetimeSheetCount surfaces stderr', async () => {
  execMock.mockRejectedValueOnce({ stderr: 'error: corrupt count' });
  await expect(
    incrementLifetimeSheetCount({ devRoot: '/dev-root' })
  ).rejects.toThrow('error: corrupt count');
});

test('incrementLifetimeSheetCount rethrows other errors', async () => {
  execMock.mockRejectedValueOnce(new Error('sudo: not found'));
  await expect(
    incrementLifetimeSheetCount({ devRoot: '/dev-root' })
  ).rejects.toThrow('sudo: not found');
});

const execFileAsync = promisify(execFileCallback);

function runScript(args: string[], env: NodeJS.ProcessEnv = process.env) {
  return execFileAsync(
    intermediateScript('increment-lifetime-sheet-count'),
    args,
    {
      env,
    }
  );
}

function makeLifetimeSheetCountFilePath(): string {
  return join(makeTemporaryDirectory(), 'lifetime-sheet-count');
}

test('increment-lifetime-sheet-count script requires exactly one argument', async () => {
  await expect(runScript([])).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringMatching(/Usage/),
  });
  await expect(runScript(['a', 'b'])).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringMatching(/Usage/),
  });
});

test('increment-lifetime-sheet-count script creates and increments the count', async () => {
  const lifetimeSheetCountFilePath = makeLifetimeSheetCountFilePath();
  await runScript([lifetimeSheetCountFilePath]);
  expect(readFileSync(lifetimeSheetCountFilePath, 'utf8')).toEqual('1\n');
  await runScript([lifetimeSheetCountFilePath]);
  expect(readFileSync(lifetimeSheetCountFilePath, 'utf8')).toEqual('2\n');
});

test('increment-lifetime-sheet-count script serializes concurrent increments', async () => {
  const lifetimeSheetCountFilePath = makeLifetimeSheetCountFilePath();
  await Promise.all(
    range(0, 20).map(() => runScript([lifetimeSheetCountFilePath]))
  );
  expect(readFileSync(lifetimeSheetCountFilePath, 'utf8')).toEqual('20\n');
});

test('increment-lifetime-sheet-count script refuses a corrupt count', async () => {
  const lifetimeSheetCountFilePath = makeLifetimeSheetCountFilePath();
  writeFileSync(lifetimeSheetCountFilePath, '$(touch /tmp/pwned)\n');
  await expect(runScript([lifetimeSheetCountFilePath])).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringMatching(/corrupt count/),
  });
  expect(readFileSync(lifetimeSheetCountFilePath, 'utf8')).toEqual(
    '$(touch /tmp/pwned)\n'
  );
});

test('increment-lifetime-sheet-count script refuses unexpected paths via sudo', async () => {
  const lifetimeSheetCountFilePath = makeLifetimeSheetCountFilePath();
  await expect(
    runScript([lifetimeSheetCountFilePath], {
      ...process.env,
      SUDO_USER: 'vx-services',
    })
  ).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringMatching(/refusing to write to file via sudo/),
  });
  expect(existsSync(lifetimeSheetCountFilePath)).toEqual(false);
});
