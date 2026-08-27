import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { assertDefined } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { DEV_MACHINE_ID, LATEST_SOFTWARE_VERSION } from '@votingworks/types';
import { mockBaseLogger } from '@votingworks/logging';
import {
  addCvrWithBallotImage,
  makeConfiguredWorkspace,
  mockDiskSpace,
} from '../../../test/backup.js';
import { prepare } from './prepare_step.js';
import { copy } from './copy_step.js';
import { ProgressEvent } from '../progress.js';

vi.mock(
  import('@votingworks/backend'),
  async (importActual): Promise<typeof import('@votingworks/backend')> => {
    const actual = await importActual();
    return {
      ...actual,
      getDiskSpaceSummaries: vi.fn(),
    };
  }
);

beforeEach(() => {
  mockDiskSpace();
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('copies staged files to the backup directory and builds a manifest', async () => {
  const workspace = await makeConfiguredWorkspace();
  addCvrWithBallotImage(workspace);

  const prepareResult = await prepare({
    workspace,
    target: makeTemporaryDirectory(),
    logger: mockBaseLogger({ fn: vi.fn }),
  });
  const { electionId, source, snapshotStore } = prepareResult.unsafeUnwrap();

  const backupPath = join(makeTemporaryDirectory(), 'backup');
  const progressEvents: ProgressEvent[] = [];

  const electionMetadata = assertDefined(
    snapshotStore.getElectionMetadata(electionId)
  );
  const manifest = await copy({
    electionId,
    source,
    store: snapshotStore,
    backup: backupPath,
    logger: mockBaseLogger({ fn: vi.fn }),
    onProgressEvent: (event) => progressEvents.push(event),
  });

  // Every staged file landed at `<backup>/<relativePath>` with the exact
  // bytes it had in the staging area, and the manifest describes it
  // accurately.
  const stagedFiles = source.listStagedFiles();
  expect(manifest.files).toHaveLength(stagedFiles.length);
  for (const stagedFile of stagedFiles) {
    const entry = manifest.files.find(
      (file) => file.path === join('workspace', stagedFile.relativePath)
    );
    expect(entry).toBeDefined();

    const copiedBytes = await readFile(join(backupPath, entry!.path));
    expect(copiedBytes).toEqual(await readFile(stagedFile.path));
    expect(entry!.size).toEqual(copiedBytes.length);
    expect(entry!.hash).toEqual(
      createHash('sha256').update(copiedBytes).digest('hex')
    );
  }

  expect(manifest.machineId).toEqual(DEV_MACHINE_ID);
  expect(manifest.softwareVersion).toEqual(LATEST_SOFTWARE_VERSION);
  expect(manifest.election).toEqual(electionMetadata);

  // Progress events bracket the copy with 0/total and total/total, and each
  // in-between event names the file currently being copied.
  expect(progressEvents.at(0)).toMatchObject({
    type: 'copy_files',
    copiedCount: 0,
    totalCount: stagedFiles.length,
  });
  expect(progressEvents.at(-1)).toMatchObject({
    type: 'copy_files',
    copiedCount: stagedFiles.length,
    totalCount: stagedFiles.length,
  });
  const namedFiles = progressEvents
    .filter((event) => event.type === 'copy_files' && event.current)
    .reduce(
      (set, event) => set.add((event as { current: string }).current),
      new Set<string>()
    );
  expect(Array.from(namedFiles.values()).toSorted()).toEqual(
    stagedFiles.map((file) => file.relativePath).toSorted()
  );

  await source.cleanup();
});

interface CopyFilesEvent {
  type: 'copy_files';
  current?: string;
  copiedCount: number;
  totalCount: number;
  copiedBytes: number;
  totalBytes: number;
}

async function copyWithProgress(
  progressEventIntervalBytes: number
): Promise<{ events: CopyFilesEvent[]; fileCount: number }> {
  const workspace = await makeConfiguredWorkspace();
  addCvrWithBallotImage(workspace);

  const prepareResult = await prepare({
    workspace,
    target: makeTemporaryDirectory(),
    logger: mockBaseLogger({ fn: vi.fn }),
  });
  const {
    electionId,
    source,
    snapshotStore: store,
  } = prepareResult.unsafeUnwrap();
  const events: ProgressEvent[] = [];

  await copy({
    electionId,
    source,
    store,
    backup: join(makeTemporaryDirectory(), 'backup'),
    logger: mockBaseLogger({ fn: vi.fn }),
    progressEventIntervalBytes,
    onProgressEvent: (event) => events.push(event),
  });

  const { fileCount } = source;
  await source.cleanup();

  return {
    events: events.filter((event) => event.type === 'copy_files'),
    fileCount,
  };
}

test('reports progress within a single file as it is copied', async () => {
  // Small enough that the staged database alone spans several intervals.
  const { events } = await copyWithProgress(1_000);

  const perFile = new Map<string, number>();
  for (const event of events) {
    if (event.current) {
      perFile.set(event.current, (perFile.get(event.current) ?? 0) + 1);
    }
  }

  // The database snapshot is by far the largest staged file, so at least one
  // file must report more than the single event that announces it.
  expect(
    Array.from(perFile.values()).filter((count) => count > 1).length
  ).toBeGreaterThan(0);
});

test('reports copied bytes and counts that only ever move forward', async () => {
  const { events, fileCount } = await copyWithProgress(1_000);

  const { totalBytes, totalCount } = events[0]!;

  for (const [index, event] of events.entries()) {
    const previous = events[index - 1];
    if (previous) {
      expect(event.copiedBytes).toBeGreaterThanOrEqual(previous.copiedBytes);
      expect(event.copiedCount).toBeGreaterThanOrEqual(previous.copiedCount);
    }

    // Progress can reach the total but never overstate it, and a file being
    // copied is by definition not yet counted as copied.
    expect(event.copiedBytes).toBeLessThanOrEqual(totalBytes);
    expect(event.copiedCount).toBeLessThanOrEqual(totalCount);
    if (event.current) {
      expect(event.copiedCount).toBeLessThan(totalCount);
    }
  }

  expect(events.at(0)).toMatchObject({ copiedBytes: 0, copiedCount: 0 });
  expect(events.at(-1)).toMatchObject({
    copiedBytes: totalBytes,
    copiedCount: fileCount,
  });
});

test('throttles progress to the given interval', async () => {
  const { events, fileCount } = await copyWithProgress(Number.MAX_SAFE_INTEGER);

  // An interval no file can cross leaves only the events that bracket the copy
  // and the one announcing each file.
  expect(events).toHaveLength(fileCount + 2);
});
