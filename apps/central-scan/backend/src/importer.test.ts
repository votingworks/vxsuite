import { expect, test, vi } from 'vitest';
import {
  makeTemporaryDirectory,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import { deferred } from '@votingworks/basics';
import { mockBaseLogger, mockLogger } from '@votingworks/logging';
import { createImageData } from 'canvas';
import { Importer } from './importer';
import { createWorkspace, Workspace } from './util/workspace';
import { makeMockScanner, MockScanner } from '../test/util/mocks';
import { BatchControl, BatchScanner } from './fujitsu_scanner';

const electionDefinition = readElectionGeneralDefinition();

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
  const { importer, scanner } = setupImporter();
  importer.configure(electionDefinition, 'test-jurisdiction', 'test-hash');

  scanner.withNextScannerSession().end();

  const first = importer.startImport();
  await expect(importer.startImport()).rejects.toThrowError(
    'already starting import'
  );

  await first;
  await importer.waitForEndOfBatchOrScanningPause();

  // isStartingBatch is reset, so a new call should work
  scanner.withNextScannerSession().end();
  await expect(importer.startImport()).resolves.toBeDefined();
  await importer.waitForEndOfBatchOrScanningPause();
});

test('finishBatch clears currentBatch before async cleanup to prevent concurrent calls', async () => {
  const { workspace } = setupImporter();

  // Create a scanner where endBatch is a deferred promise we control, so we
  // can observe intermediate state while finishBatch is running.
  const endBatchDeferred = deferred<void>();
  const endBatchMock = vi.fn().mockReturnValue(endBatchDeferred.promise);
  const scanner: BatchScanner = {
    isAttached: vi.fn().mockReturnValue(true),
    isImprinterAttached: vi.fn().mockResolvedValue(false),
    scanSheets: () => {
      const control: BatchControl = {
        scanSheet: vi.fn(), // no sheets → triggers finishBatch
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

  await importer.startImport();

  // At this point, scanOneSheet found no sheets and called finishBatch.
  // finishBatch should have cleared currentBatch immediately, even though
  // endBatch hasn't resolved yet.
  const finishBatchSpy = vi.spyOn(workspace.store, 'finishBatch');

  // Wait a tick to let the fire-and-forget scanOneSheet promise run
  await vi.waitFor(() => {
    expect(endBatchMock).toHaveBeenCalled();
  });

  // Verify currentBatch is already cleared while endBatch is still pending
  expect(importer.getStatus().ongoingBatchId).toBeUndefined();

  // store.finishBatch should have been called exactly once
  // (the call happened before our spy, so check the batch was finished)
  const batches = workspace.store.getBatches();
  expect(batches).toHaveLength(1);
  expect(batches[0]!.endedAt).toBeDefined();

  // Resolve endBatch and let cleanup complete
  endBatchDeferred.resolve();
  await importer.waitForEndOfBatchOrScanningPause();

  // No additional finishBatch calls should have been made
  expect(finishBatchSpy).not.toHaveBeenCalled();
});

test('startImport cleans up batch on failure after addBatch', async () => {
  const { importer, workspace, scanner } = setupImporter();
  importer.configure(electionDefinition, 'test-jurisdiction', 'test-hash');

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
