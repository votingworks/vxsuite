import { expect, test, vi } from 'vitest';
import {
  makeTemporaryDirectory,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import { mockBaseLogger, mockLogger } from '@votingworks/logging';
import { createImageData } from 'canvas';
import { Importer } from './importer';
import { createWorkspace, Workspace } from './util/workspace';
import { makeMockScanner, MockScanner } from '../test/util/mocks';

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
