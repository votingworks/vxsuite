import { expect, test, vi } from 'vitest';
import {
  makeTemporaryDirectory,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import { deferred } from '@votingworks/basics';
import { mockBaseLogger, mockLogger } from '@votingworks/logging';
import { createImageData } from 'canvas';
import { anyPollingPlace } from '@votingworks/types';
import { Importer } from './importer';
import { createWorkspace, Workspace } from './util/workspace';
import { makeMockScanner, MockScanner } from '../test/util/mocks';
import { BatchControl, BatchScanner } from './fujitsu_scanner';

const electionDefinition = readElectionGeneralDefinition();
const { election } = electionDefinition;

function setupImporter(): {
  importer: Importer;
  workspace: Workspace;
  scanner: MockScanner;
} {
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
  const scanner = makeMockScanner();
  const importer = new Importer({
    workspace,
    scanner,
    logger: mockLogger({ fn: vi.fn }),
  });
  return { importer, workspace, scanner };
}

test('no election is configured', async () => {
  const { importer } = setupImporter();

  await expect(importer.startImport()).rejects.toThrowError(
    'no election configuration'
  );

  await expect(
    importer.importSheet(
      'batch-1',
      createImageData(1, 1),
      createImageData(1, 1)
    )
  ).rejects.toThrowError('no election configuration');
});

test('startImport rejects concurrent calls', async () => {
  const { importer, scanner, workspace } = setupImporter();
  importer.configure(electionDefinition, 'test-jurisdiction', 'test-hash');
  workspace.store.setPollingPlaceId(anyPollingPlace(election).id);

  scanner.withNextScannerSession().end();

  const first = importer.startImport();
  await expect(importer.startImport()).rejects.toThrowError(
    'already starting import'
  );

  await first;
  await importer.waitForEndOfBatchOrScanningPause();

  // the batch pauses when the tray empties and stays open until saved
  expect(importer.getStatus().currentBatch).toEqual({
    batchId: expect.any(String),
    state: 'paused',
    pauseReason: 'tray-empty',
  });
  await expect(importer.startImport()).rejects.toThrowError(
    'scanning already in progress'
  );
  await importer.saveBatch();

  // isStartingBatch is reset and the batch is saved, so a new call should work
  scanner.withNextScannerSession().end();
  await expect(importer.startImport()).resolves.toBeDefined();
  await importer.waitForEndOfBatchOrScanningPause();
});

test('saveBatch clears currentBatch before async cleanup to prevent concurrent calls', async () => {
  const { workspace } = setupImporter();

  // Create a scanner where the second endBatch call (the one made by
  // finishBatch during save; the first happens when the batch pauses) is a
  // deferred promise we control, so we can observe intermediate state while
  // finishBatch is running.
  const endBatchDeferred = deferred<void>();
  let endBatchCalls = 0;
  const endBatchMock = vi.fn(() => {
    endBatchCalls += 1;
    return endBatchCalls === 1 ? Promise.resolve() : endBatchDeferred.promise;
  });
  const scanner: BatchScanner = {
    isAttached: vi.fn().mockReturnValue(true),
    isImprinterAttached: vi.fn().mockResolvedValue(false),
    scanSheets: () => {
      const control: BatchControl = {
        scanSheet: vi.fn(), // no sheets → pauses the batch
        endBatch: endBatchMock,
      };
      return control;
    },
  };

  const importer = new Importer({
    workspace,
    scanner,
    logger: mockLogger({ fn: vi.fn }),
  });
  importer.configure(electionDefinition, 'test-jurisdiction', 'test-hash');
  workspace.store.setPollingPlaceId(anyPollingPlace(election).id);

  await importer.startImport();
  await importer.waitForEndOfBatchOrScanningPause();
  expect(importer.getStatus().currentBatch?.state).toEqual('paused');

  const savePromise = importer.saveBatch();

  // finishBatch should have cleared currentBatch immediately, even though
  // endBatch hasn't resolved yet.
  await vi.waitFor(() => {
    expect(endBatchMock).toHaveBeenCalledTimes(2);
  });
  expect(importer.getStatus().currentBatch).toBeUndefined();

  // the batch was finished in the store before cleanup completed
  const batches = workspace.store.getBatches();
  expect(batches).toHaveLength(1);
  expect(batches[0].endedAt).toBeDefined();

  // Resolve endBatch and let cleanup complete
  endBatchDeferred.resolve();
  await savePromise;
});

test('a paused batch can be continued with a fresh scanner session or canceled', async () => {
  const { importer, workspace, scanner } = setupImporter();
  importer.configure(electionDefinition, 'test-jurisdiction', 'test-hash');
  workspace.store.setPollingPlaceId(anyPollingPlace(election).id);

  scanner.withNextScannerSession().end();
  await importer.startImport();
  await importer.waitForEndOfBatchOrScanningPause();
  expect(importer.getStatus().currentBatch).toEqual({
    batchId: expect.any(String),
    state: 'paused',
    pauseReason: 'tray-empty',
  });

  // continuing opens a fresh scanner session for the same batch; an empty
  // tray pauses it again
  scanner.withNextScannerSession().end();
  importer.continueBatch();
  await importer.waitForEndOfBatchOrScanningPause();
  expect(importer.getStatus().currentBatch).toEqual({
    batchId: expect.any(String),
    state: 'paused',
    pauseReason: 'tray-empty',
  });

  // canceling discards the batch entirely
  await importer.cancelBatch();
  expect(importer.getStatus().currentBatch).toBeUndefined();
  expect(workspace.store.getBatches()).toHaveLength(0);
});

test('cancelBatch while scanning halts the feed and discards the batch', async () => {
  const { importer, workspace, scanner } = setupImporter();
  importer.configure(electionDefinition, 'test-jurisdiction', 'test-hash');
  workspace.store.setPollingPlaceId(anyPollingPlace(election).id);

  // A session that never produces a sheet until we let it observe the end of
  // the stream, simulating a scanner waiting for paper.
  const gate = deferred<void>();
  scanner.withNextScannerSession().end(gate.promise);

  await importer.startImport();
  expect(importer.getStatus().currentBatch).toEqual({
    batchId: expect.any(String),
    state: 'scanning',
    pauseReason: undefined,
  });

  const cancelPromise = importer.cancelBatch();
  gate.resolve();
  await cancelPromise;

  expect(importer.getStatus().currentBatch).toBeUndefined();
  expect(workspace.store.getBatches()).toHaveLength(0);
});

test('batch controls require the right batch state', async () => {
  const { importer, workspace, scanner } = setupImporter();
  importer.configure(electionDefinition, 'test-jurisdiction', 'test-hash');
  workspace.store.setPollingPlaceId(anyPollingPlace(election).id);

  // no batch at all
  expect(() => importer.continueBatch()).toThrowError('no paused batch');
  await expect(importer.saveBatch()).rejects.toThrowError('no paused batch');
  await expect(importer.cancelBatch()).rejects.toThrowError(
    'no batch in progress'
  );

  // while actively scanning (cancelBatch, in contrast, is allowed)
  const gate = deferred<void>();
  scanner.withNextScannerSession().end(gate.promise);
  await importer.startImport();
  expect(() => importer.continueBatch()).toThrowError('no paused batch');
  await expect(importer.saveBatch()).rejects.toThrowError('no paused batch');

  gate.resolve();
  await importer.waitForEndOfBatchOrScanningPause();
  await importer.saveBatch();
  expect(importer.getStatus().currentBatch).toBeUndefined();
  expect(workspace.store.getBatches()[0].endedAt).toBeDefined();
});

test('a scanner error pauses the batch so it can be retried', async () => {
  const { importer, workspace, scanner } = setupImporter();
  importer.configure(electionDefinition, 'test-jurisdiction', 'test-hash');
  workspace.store.setPollingPlaceId(anyPollingPlace(election).id);

  scanner.withNextScannerSession().error(new Error('scanner jam')).end();

  await importer.startImport();
  await importer.waitForEndOfBatchOrScanningPause();

  // the batch stays open, paused with an error, instead of being finished
  expect(importer.getStatus().currentBatch).toEqual({
    batchId: expect.any(String),
    state: 'paused',
    pauseReason: 'error',
  });
  expect(workspace.store.getBatches()[0].endedAt).toBeUndefined();

  // continuing retries with a fresh scanner session
  scanner.withNextScannerSession().end();
  importer.continueBatch();
  await importer.waitForEndOfBatchOrScanningPause();
  expect(importer.getStatus().currentBatch).toEqual({
    batchId: expect.any(String),
    state: 'paused',
    pauseReason: 'tray-empty',
  });

  await importer.saveBatch();
  expect(importer.getStatus().currentBatch).toBeUndefined();
  expect(workspace.store.getBatches()[0].endedAt).toBeDefined();
});

test('a scanner error finishes the batch if pausing also fails', async () => {
  const { workspace } = setupImporter();

  // A scanner whose sheet stream errors AND whose session refuses to end, so
  // pausing the batch is impossible.
  const scanner: BatchScanner = {
    isAttached: vi.fn().mockReturnValue(true),
    isImprinterAttached: vi.fn().mockResolvedValue(false),
    scanSheets: () => {
      const control: BatchControl = {
        scanSheet: vi.fn().mockRejectedValue(new Error('scan failed')),
        endBatch: vi.fn().mockRejectedValue(new Error('end failed')),
      };
      return control;
    },
  };

  const importer = new Importer({
    workspace,
    scanner,
    logger: mockLogger({ fn: vi.fn }),
  });
  importer.configure(electionDefinition, 'test-jurisdiction', 'test-hash');
  workspace.store.setPollingPlaceId(anyPollingPlace(election).id);

  await importer.startImport();
  await vi.waitFor(() => {
    expect(importer.getStatus().currentBatch).toBeUndefined();
  });

  // last resort: the batch is finished, recording the error
  const batches = workspace.store.getBatches();
  expect(batches).toHaveLength(1);
  expect(batches[0].endedAt).toBeDefined();
  expect(batches[0].error).toContain('scan failed');
});

test('startImport cleans up batch on failure after addBatch', async () => {
  const { importer, workspace, scanner } = setupImporter();
  importer.configure(electionDefinition, 'test-jurisdiction', 'test-hash');
  workspace.store.setPollingPlaceId(anyPollingPlace(election).id);

  // Make scanSheets throw to simulate a failure after addBatch but before
  // this.currentBatch is set
  const scanSheetsSpy = vi
    .spyOn(scanner, 'scanSheets')
    .mockImplementation(() => {
      throw new Error('scanner unavailable');
    });

  await expect(importer.startImport()).rejects.toThrowError(
    'scanner unavailable'
  );

  // The batch created by addBatch should have been cleaned up
  expect(workspace.store.getBatches()).toHaveLength(0);

  scanSheetsSpy.mockRestore();
});
