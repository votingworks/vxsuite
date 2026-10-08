import { execFile as execFileCallback } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { err, ok, range } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { beforeEach, expect, test, vi } from 'vitest';
import { execFile } from './exec.js';
import { intermediateScript } from './intermediate_scripts.js';
import {
  getLifetimeSheetCountFilePath,
  incrementLifetimeSheetCount,
  readLifetimeSheetCount,
} from './lifetime_sheet_count.js';

vi.mock(
  import('./exec.js'),
  async (importActual): Promise<typeof import('./exec.js')> => ({
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

test('readLifetimeSheetCount returns 0 when the file does not exist', async () => {
  expect(
    await readLifetimeSheetCount({ devRoot: makeTemporaryDirectory() })
  ).toEqual(ok(0));
});

test('readLifetimeSheetCount returns the count from the file', async () => {
  const devRoot = makeTemporaryDirectory();
  writeFileSync(join(devRoot, 'lifetime-sheet-count'), '42\n');
  expect(await readLifetimeSheetCount({ devRoot })).toEqual(ok(42));
});

test('readLifetimeSheetCount reads from VX_CONFIG_ROOT in production', async () => {
  const configRoot = makeTemporaryDirectory();
  writeFileSync(join(configRoot, 'lifetime-sheet-count'), '7\n');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VX_CONFIG_ROOT', configRoot);
  expect(
    await readLifetimeSheetCount({ devRoot: makeTemporaryDirectory() })
  ).toEqual(ok(7));
});

test.each(['', ' \n', 'abc\n', '-1\n', '1.5\n', '0x10\n', '1e3\n'])(
  'readLifetimeSheetCount rejects corrupt contents %j',
  async (contents) => {
    const devRoot = makeTemporaryDirectory();
    writeFileSync(join(devRoot, 'lifetime-sheet-count'), contents);
    expect(await readLifetimeSheetCount({ devRoot })).toEqual(
      err(expect.stringMatching(/^Error reading lifetime sheet count: /))
    );
  }
);

test('readLifetimeSheetCount rejects a count beyond the safe integer range', async () => {
  const devRoot = makeTemporaryDirectory();
  writeFileSync(join(devRoot, 'lifetime-sheet-count'), '9'.repeat(20));
  expect(await readLifetimeSheetCount({ devRoot })).toEqual(
    err(expect.stringMatching(/^Error reading lifetime sheet count: /))
  );
});

test('readLifetimeSheetCount rejects a file that is too large', async () => {
  const devRoot = makeTemporaryDirectory();
  writeFileSync(join(devRoot, 'lifetime-sheet-count'), '1'.repeat(1025));
  expect(await readLifetimeSheetCount({ devRoot })).toEqual(
    err('Error reading lifetime sheet count: FileExceedsMaxSize')
  );
});

test('readLifetimeSheetCount rejects a path that is not a regular file', async () => {
  const devRoot = makeTemporaryDirectory();
  mkdirSync(join(devRoot, 'lifetime-sheet-count'));
  expect(await readLifetimeSheetCount({ devRoot })).toEqual(
    err('Error reading lifetime sheet count: NotRegularFile')
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

test('readLifetimeSheetCount reads the count written by the script', async () => {
  const devRoot = makeTemporaryDirectory();
  await runScript([join(devRoot, 'lifetime-sheet-count')]);
  await runScript([join(devRoot, 'lifetime-sheet-count')]);
  expect(await readLifetimeSheetCount({ devRoot })).toEqual(ok(2));
});
