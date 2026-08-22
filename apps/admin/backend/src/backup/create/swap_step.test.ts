import { expect, test, vi } from 'vitest';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ok } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import { swap } from './swap_step.js';
import { ProgressEvent } from './types.js';

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
      backup,
      logger: mockBaseLogger({ fn: vi.fn }),
      onProgressEvent: (event) => progressEvents.push(event),
    })
  ).toEqual(ok());

  expect(progressEvents).toEqual([{ type: 'swapping_backup' }]);
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
