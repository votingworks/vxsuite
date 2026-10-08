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
  getScanCountFilePath,
  incrementScanCount,
} from './increment_scan_count.js';

vi.mock(
  import('../exec.js'),
  async (importActual): Promise<typeof import('../exec.js')> => ({
    ...(await importActual()),
    execFile: vi.fn(),
  })
);

const execMock = vi.mocked(execFile);
const SCRIPT_PATH_MATCHER = expect.stringMatching(
  /^\/.*\/libs\/backend\/intermediate-scripts\/increment-scan-count$/
);

beforeEach(() => {
  execMock.mockReset();
  vi.unstubAllEnvs();
});

function stubProductionEnv(): void {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VX_CONFIG_ROOT', '/vx/config');
}

test('getScanCountFilePath uses VX_CONFIG_ROOT in production', () => {
  stubProductionEnv();
  expect(getScanCountFilePath({ devRoot: '/dev-root' })).toEqual(
    '/vx/config/scan-count'
  );
});

test('getScanCountFilePath requires VX_CONFIG_ROOT in production', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VX_CONFIG_ROOT', undefined);
  expect(() => getScanCountFilePath({ devRoot: '/dev-root' })).toThrow(
    'Missing required VX_CONFIG_ROOT env var'
  );
});

test('getScanCountFilePath uses devRoot outside production', () => {
  vi.stubEnv('VX_CONFIG_ROOT', '/vx/config');
  expect(getScanCountFilePath({ devRoot: '/dev-root' })).toEqual(
    '/dev-root/scan-count'
  );
});

test('getScanCountFilePath uses devRoot in integration tests', () => {
  stubProductionEnv();
  vi.stubEnv('IS_INTEGRATION_TEST', 'true');
  expect(getScanCountFilePath({ devRoot: '/dev-root' })).toEqual(
    '/dev-root/scan-count'
  );
});

test('incrementScanCount runs the script via sudo in production', async () => {
  stubProductionEnv();
  await incrementScanCount({ devRoot: '/dev-root' });
  expect(execMock).toHaveBeenCalledExactlyOnceWith('sudo', [
    SCRIPT_PATH_MATCHER,
    '/vx/config/scan-count',
  ]);
});

test('incrementScanCount runs the script directly outside production', async () => {
  await incrementScanCount({ devRoot: '/dev-root' });
  expect(execMock).toHaveBeenCalledExactlyOnceWith(SCRIPT_PATH_MATCHER, [
    '/dev-root/scan-count',
  ]);
});

test('incrementScanCount surfaces stderr', async () => {
  execMock.mockRejectedValueOnce({ stderr: 'error: corrupt count' });
  await expect(incrementScanCount({ devRoot: '/dev-root' })).rejects.toThrow(
    'error: corrupt count'
  );
});

test('incrementScanCount rethrows other errors', async () => {
  execMock.mockRejectedValueOnce(new Error('sudo: not found'));
  await expect(incrementScanCount({ devRoot: '/dev-root' })).rejects.toThrow(
    'sudo: not found'
  );
});

const execFileAsync = promisify(execFileCallback);

function runScript(args: string[], env: NodeJS.ProcessEnv = process.env) {
  return execFileAsync(intermediateScript('increment-scan-count'), args, {
    env,
  });
}

function makeScanCountFilePath(): string {
  return join(makeTemporaryDirectory(), 'scan-count');
}

test('increment-scan-count script requires exactly one argument', async () => {
  await expect(runScript([])).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringMatching(/Usage/),
  });
  await expect(runScript(['a', 'b'])).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringMatching(/Usage/),
  });
});

test('increment-scan-count script creates and increments the count', async () => {
  const scanCountFilePath = makeScanCountFilePath();
  await runScript([scanCountFilePath]);
  expect(readFileSync(scanCountFilePath, 'utf8')).toEqual('1\n');
  await runScript([scanCountFilePath]);
  expect(readFileSync(scanCountFilePath, 'utf8')).toEqual('2\n');
});

test('increment-scan-count script serializes concurrent increments', async () => {
  const scanCountFilePath = makeScanCountFilePath();
  await Promise.all(range(0, 20).map(() => runScript([scanCountFilePath])));
  expect(readFileSync(scanCountFilePath, 'utf8')).toEqual('20\n');
});

test('increment-scan-count script refuses a corrupt count', async () => {
  const scanCountFilePath = makeScanCountFilePath();
  writeFileSync(scanCountFilePath, '$(touch /tmp/pwned)\n');
  await expect(runScript([scanCountFilePath])).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringMatching(/corrupt count/),
  });
  expect(readFileSync(scanCountFilePath, 'utf8')).toEqual(
    '$(touch /tmp/pwned)\n'
  );
});

test('increment-scan-count script refuses unexpected paths via sudo', async () => {
  const scanCountFilePath = makeScanCountFilePath();
  await expect(
    runScript([scanCountFilePath], { ...process.env, SUDO_USER: 'vx-services' })
  ).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringMatching(/refusing to write to file via sudo/),
  });
  expect(existsSync(scanCountFilePath)).toEqual(false);
});
