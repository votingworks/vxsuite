import { expect, test, vi } from 'vitest';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { err, ok, Result } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import { exchangePaths, syncFilesystem, SyscallError } from '@votingworks/fs';
import { swap } from './swap_step.js';
import { ProgressEvent } from '../progress.js';

vi.mock(
  import('@votingworks/fs'),
  async (importActual): Promise<typeof import('@votingworks/fs')> => {
    const actual = await importActual();
    return {
      ...actual,
      exchangePaths: vi.fn(actual.exchangePaths),
      syncFilesystem: vi.fn(actual.syncFilesystem),
    };
  }
);

function makeBackupDirectory(path: string, contents: string): string {
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'manifest.json'), contents);
  return path;
}

test('renames the in-progress backup into place when there is none yet', async () => {
  const target = makeTemporaryDirectory();
  const inProgressBackup = makeBackupDirectory(
    join(target, 'election-in-progress'),
    'new'
  );
  const backup = join(target, 'election');
  const progressEvents: ProgressEvent[] = [];

  expect(
    await swap({
      inProgressBackup,
      target,
      backup,
      logger: mockBaseLogger({ fn: vi.fn }),
      onProgressEvent: (event) => progressEvents.push(event),
    })
  ).toEqual(ok());

  expect(progressEvents).toEqual([
    { type: 'flushing_backup' },
    { type: 'swapping_backup' },
    { type: 'flushing_backup' },
  ]);
  expect(readFileSync(join(backup, 'manifest.json'), 'utf-8')).toEqual('new');
  expect(existsSync(inProgressBackup)).toEqual(false);
});

test('exchanges an existing backup for the in-progress one and discards it', async () => {
  const target = makeTemporaryDirectory();
  const inProgressBackup = makeBackupDirectory(
    join(target, 'election-in-progress'),
    'new'
  );
  const backup = makeBackupDirectory(join(target, 'election'), 'old');

  expect(
    await swap({
      inProgressBackup,
      target,
      backup,
      logger: mockBaseLogger({ fn: vi.fn }),
    })
  ).toEqual(ok());

  expect(readFileSync(join(backup, 'manifest.json'), 'utf-8')).toEqual('new');
  expect(existsSync(inProgressBackup)).toEqual(false);
});

test('returns an error when the exchange fails', async () => {
  const target = makeTemporaryDirectory();
  const backup = makeBackupDirectory(join(target, 'election'), 'old');

  // `renameat2(RENAME_EXCHANGE)` requires both paths to exist, so pointing at
  // a missing in-progress backup exercises the failure path.
  const swapResult = await swap({
    inProgressBackup: join(target, 'election-in-progress'),
    target,
    backup,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(swapResult.err()).toEqual({
    type: 'backup-swap-failed',
    message: expect.stringContaining('Failed to swap in the new backup'),
  });

  // The backup that was already there is untouched.
  expect(readFileSync(join(backup, 'manifest.json'), 'utf-8')).toEqual('old');
});

test('flushes the backup to the device before and after swapping it in', async () => {
  const target = makeTemporaryDirectory();
  const inProgressBackup = makeBackupDirectory(
    join(target, 'election-in-progress'),
    'new'
  );
  const backup = makeBackupDirectory(join(target, 'election'), 'old');
  const calls: string[] = [];

  function recordFlush(): Promise<Result<void, SyscallError>> {
    calls.push('flush');
    return Promise.resolve(ok());
  }

  vi.mocked(syncFilesystem)
    .mockImplementationOnce(recordFlush)
    .mockImplementationOnce(recordFlush);
  vi.mocked(exchangePaths).mockImplementationOnce(() => {
    calls.push('swap');
    return ok();
  });

  expect(
    await swap({
      inProgressBackup,
      target,
      backup,
      logger: mockBaseLogger({ fn: vi.fn }),
    })
  ).toEqual(ok());

  // The data has to reach the device before the name that promises it, and the
  // rename has to reach the device after that.
  expect(calls).toEqual(['flush', 'swap', 'flush']);
});

test('returns an error when the flush before the swap fails', async () => {
  const target = makeTemporaryDirectory();
  const inProgressBackup = makeBackupDirectory(
    join(target, 'election-in-progress'),
    'new'
  );
  const backup = makeBackupDirectory(join(target, 'election'), 'old');

  vi.mocked(syncFilesystem).mockResolvedValueOnce(
    err({ code: 'EIO', message: 'EIO: I/O error' })
  );

  const swapResult = await swap({
    inProgressBackup,
    target,
    backup,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(swapResult.err()).toEqual({
    type: 'backup-flush-failed',
    message: expect.stringContaining(
      'Failed to flush the backup to the target'
    ),
  });

  // Nothing was swapped, so the backup that was already there still stands.
  expect(readFileSync(join(backup, 'manifest.json'), 'utf-8')).toEqual('old');
  expect(existsSync(inProgressBackup)).toEqual(true);
});

test('returns an error when the flush after the swap fails', async () => {
  const target = makeTemporaryDirectory();
  const inProgressBackup = makeBackupDirectory(
    join(target, 'election-in-progress'),
    'new'
  );
  const backup = makeBackupDirectory(join(target, 'election'), 'old');

  vi.mocked(syncFilesystem)
    .mockResolvedValueOnce(ok())
    .mockResolvedValueOnce(err({ code: 'EIO', message: 'EIO: I/O error' }));

  const swapResult = await swap({
    inProgressBackup,
    target,
    backup,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(swapResult.err()).toEqual({
    type: 'backup-flush-failed',
    message: expect.stringContaining('Failed to flush the swapped-in backup'),
  });

  // The swap itself happened; we just can't promise it survives a power cut.
  expect(readFileSync(join(backup, 'manifest.json'), 'utf-8')).toEqual('new');
});
