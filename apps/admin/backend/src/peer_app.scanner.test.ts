import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { assertDefined } from '@votingworks/basics';
import {
  BooleanEnvironmentVariableName,
  getExportedCastVoteRecordIds,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  isTestReport,
  readCastVoteRecordExportMetadata,
} from '@votingworks/backend';
import { Admin, CastVoteRecordExportMetadata } from '@votingworks/types';
import ZipStream from 'zip-stream';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { addFileToZipStream } from './util/zip';
import { getMachineConfig } from './machine_config';

vi.setConfig({
  testTimeout: 60_000,
});

// mock SKIP_CVR_BALLOT_HASH_CHECK to allow us to use old cvr fixtures
const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

beforeEach(() => {
  vi.clearAllMocks();
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CVR_BALLOT_HASH_CHECK
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

const electionDefinition =
  electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
const { castVoteRecordExport } =
  electionGridLayoutNewHampshireTestBallotFixtures;

/**
 * Zips a single cast vote record directory the way a central scanner does when
 * sending cast vote records over the network.
 */
async function zipCastVoteRecordDirectory(
  exportDirectoryPath: string,
  castVoteRecordId: string
): Promise<Buffer> {
  const castVoteRecordDirectoryPath = path.join(
    exportDirectoryPath,
    castVoteRecordId
  );
  const chunks: Buffer[] = [];
  const zipStream = new ZipStream();
  zipStream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  const finished = new Promise<void>((resolve, reject) => {
    zipStream.on('end', resolve);
    zipStream.on('error', reject);
  });
  for (const entry of await readdir(castVoteRecordDirectoryPath, {
    withFileTypes: true,
  })) {
    await addFileToZipStream(zipStream, {
      path: path.join(castVoteRecordId, entry.name),
      contents: createReadStream(
        path.join(castVoteRecordDirectoryPath, entry.name)
      ),
    });
  }
  zipStream.finalize();
  await finished;
  return Buffer.concat(chunks);
}

function getPeerServerAddress(peerServer: { address: () => unknown }): string {
  const { port } = peerServer.address() as AddressInfo;
  return `http://localhost:${port}`;
}

async function readExportMetadata(
  exportDirectoryPath: string
): Promise<CastVoteRecordExportMetadata> {
  return (
    await readCastVoteRecordExportMetadata(exportDirectoryPath)
  ).unsafeUnwrap();
}

test('registerScanner records the scanner in the machines table', async () => {
  const { peerApiClient, workspace } = buildTestEnvironment();
  const machineConfig = getMachineConfig();

  const result = await peerApiClient.registerScanner({
    machineId: 'SCANNER-01',
    codeVersion: machineConfig.codeVersion,
  });
  expect(result).toEqual(machineConfig);
  expect(workspace.store.getMachine('SCANNER-01')).toMatchObject({
    machineId: 'SCANNER-01',
    machineMode: 'scanner',
    status: Admin.ClientMachineStatus.Active,
    pollingPlaceId: null,
  });
});

test('registerScanner records the scanner polling place when provided', async () => {
  const { peerApiClient, workspace } = buildTestEnvironment();
  const machineConfig = getMachineConfig();

  const result = await peerApiClient.registerScanner({
    machineId: 'SCANNER-01',
    codeVersion: machineConfig.codeVersion,
    pollingPlaceId: 'polling-place-1',
  });
  expect(result).toEqual(machineConfig);
  expect(workspace.store.getMachine('SCANNER-01')).toMatchObject({
    machineId: 'SCANNER-01',
    machineMode: 'scanner',
    status: Admin.ClientMachineStatus.Active,
    pollingPlaceId: 'polling-place-1',
  });
});

test('registerScanner accepts a scanner running a different code version', async () => {
  const { peerApiClient, workspace } = buildTestEnvironment();
  const machineConfig = getMachineConfig();

  const result = await peerApiClient.registerScanner({
    machineId: 'SCANNER-02',
    codeVersion: 'some-other-version',
  });
  expect(result).toEqual(machineConfig);
  expect(workspace.store.getMachine('SCANNER-02')).toMatchObject({
    machineId: 'SCANNER-02',
    machineMode: 'scanner',
    status: Admin.ClientMachineStatus.Active,
  });
});

test('cvr transfer session imports cast vote records one at a time', async () => {
  const { apiClient, auth, peerApiClient, peerServer } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  const exportDirectoryPath = castVoteRecordExport.asDirectoryPath();
  const metadata = await readExportMetadata(exportDirectoryPath);
  const isTestMode = isTestReport(metadata.castVoteRecordReportMetadata);
  const castVoteRecordIds =
    await getExportedCastVoteRecordIds(exportDirectoryPath);
  expect(castVoteRecordIds.length).toBeGreaterThan(0);

  const startResult = await peerApiClient.startCvrTransfer({
    machineId: 'SCANNER-01',
    batchManifest: metadata.batchManifest,
    isTestMode,
  });
  const { sessionId } = startResult.unsafeUnwrap();

  const uploadUrl = `${getPeerServerAddress(
    peerServer
  )}/api/cvr-transfer/${sessionId}/cvr`;
  for (const castVoteRecordId of castVoteRecordIds) {
    const zipBuffer = await zipCastVoteRecordDirectory(
      exportDirectoryPath,
      castVoteRecordId
    );
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array(zipBuffer),
    });
    expect(response.status).toEqual(200);
    expect(await response.json()).toEqual({ isNew: true });
  }

  const finishResult = await peerApiClient.finishCvrTransfer({ sessionId });
  expect(finishResult.unsafeUnwrap()).toEqual({
    newlyAdded: castVoteRecordIds.length,
    alreadyPresent: 0,
  });

  // The imported cast vote records appear like any other import
  const cvrFiles = await apiClient.getCastVoteRecordFiles();
  expect(cvrFiles).toHaveLength(1);
  expect(assertDefined(cvrFiles[0]).numCvrsImported).toEqual(
    castVoteRecordIds.length
  );

  // The session is gone after finishing
  const repeatFinishResult = await peerApiClient.finishCvrTransfer({
    sessionId,
  });
  expect(repeatFinishResult.err()).toEqual({ type: 'session-not-found' });

  // A second transfer of the same cast vote records reports duplicates
  const secondStartResult = await peerApiClient.startCvrTransfer({
    machineId: 'SCANNER-01',
    batchManifest: metadata.batchManifest,
    isTestMode,
  });
  const { sessionId: secondSessionId } = secondStartResult.unsafeUnwrap();
  const firstCastVoteRecordId = assertDefined(castVoteRecordIds[0]);
  const zipBuffer = await zipCastVoteRecordDirectory(
    exportDirectoryPath,
    firstCastVoteRecordId
  );
  const response = await fetch(
    `${getPeerServerAddress(
      peerServer
    )}/api/cvr-transfer/${secondSessionId}/cvr`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array(zipBuffer),
    }
  );
  expect(response.status).toEqual(200);
  expect(await response.json()).toEqual({ isNew: false });
  const secondFinishResult = await peerApiClient.finishCvrTransfer({
    sessionId: secondSessionId,
  });
  expect(secondFinishResult.unsafeUnwrap()).toEqual({
    newlyAdded: 0,
    alreadyPresent: 1,
  });

  // A transfer in the opposite mode (test vs. official) is rejected
  const invalidModeResult = await peerApiClient.startCvrTransfer({
    machineId: 'SCANNER-01',
    batchManifest: metadata.batchManifest,
    isTestMode: !isTestMode,
  });
  expect(invalidModeResult.err()).toEqual({
    type: 'invalid-mode',
    currentMode: isTestMode ? 'test' : 'official',
  });
});

test('deleting a single import removes only its exclusive cast vote records', async () => {
  const { apiClient, auth, peerApiClient, peerServer } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  const exportDirectoryPath = castVoteRecordExport.asDirectoryPath();
  const metadata = await readExportMetadata(exportDirectoryPath);
  const isTestMode = isTestReport(metadata.castVoteRecordReportMetadata);
  const castVoteRecordIds =
    await getExportedCastVoteRecordIds(exportDirectoryPath);
  const batchLabels = metadata.batchManifest.map((batch) => batch.label);

  async function transfer(ids: string[]): Promise<void> {
    const startResult = await peerApiClient.startCvrTransfer({
      machineId: 'SCANNER-01',
      batchManifest: metadata.batchManifest,
      isTestMode,
    });
    const { sessionId } = startResult.unsafeUnwrap();
    for (const castVoteRecordId of ids) {
      const zipBuffer = await zipCastVoteRecordDirectory(
        exportDirectoryPath,
        castVoteRecordId
      );
      const response = await fetch(
        `${getPeerServerAddress(peerServer)}/api/cvr-transfer/${sessionId}/cvr`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/zip' },
          body: new Uint8Array(zipBuffer),
        }
      );
      expect(response.status).toEqual(200);
    }
    (await peerApiClient.finishCvrTransfer({ sessionId })).unsafeUnwrap();
  }

  // First import contains all cast vote records; the second shares its first
  // record with the first import (as with cumulative USB exports).
  await transfer(castVoteRecordIds);
  await transfer([assertDefined(castVoteRecordIds[0])]);

  // A registered scanner's network status row reflects what it has imported
  const { scannerId } = assertDefined(metadata.batchManifest[0]);
  await peerApiClient.registerScanner({
    machineId: scannerId,
    codeVersion: getMachineConfig().codeVersion,
  });
  expect((await apiClient.getNetworkStatus()).connectedScanners).toEqual([
    expect.objectContaining({
      machineId: scannerId,
      importedCvrCount: castVoteRecordIds.length,
      importedBatchCount: metadata.batchManifest.length,
    }),
  ]);

  const cvrFiles = await apiClient.getCastVoteRecordFiles();
  expect(cvrFiles).toHaveLength(2);
  for (const cvrFile of cvrFiles) {
    expect(cvrFile.source).toEqual('network');
    expect(cvrFile.batchLabels).toEqual(batchLabels);
  }
  expect(await apiClient.getTotalBallotCount()).toEqual(
    castVoteRecordIds.length
  );

  // Deleting the overlapping import preserves the shared cast vote record
  // Cast vote records are attributed to the import that first added them, so
  // the overlapping import reports zero imported records of its own.
  const [firstFile, secondFile] = await apiClient.getCastVoteRecordFiles();
  const overlappingFile =
    assertDefined(firstFile).numCvrsImported === 0 ? firstFile : secondFile;
  const fullFile =
    overlappingFile === firstFile ? assertDefined(secondFile) : firstFile;
  (
    await apiClient.deleteCastVoteRecordFile({
      fileId: assertDefined(overlappingFile).id,
    })
  ).unsafeUnwrap();
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(1);
  expect(await apiClient.getTotalBallotCount()).toEqual(
    castVoteRecordIds.length
  );
  expect(await apiClient.getScannerBatches()).toHaveLength(
    metadata.batchManifest.length
  );

  // Deleting the remaining import removes its cast vote records and batches
  (
    await apiClient.deleteCastVoteRecordFile({
      fileId: assertDefined(fullFile).id,
    })
  ).unsafeUnwrap();
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  expect(await apiClient.getTotalBallotCount()).toEqual(0);
  expect(await apiClient.getScannerBatches()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecordFileMode()).toEqual('unlocked');
  expect((await apiClient.getNetworkStatus()).connectedScanners).toEqual([
    expect.objectContaining({
      importedCvrCount: 0,
      importedBatchCount: 0,
    }),
  ]);

  // Deleting an unknown file returns an error
  const notFoundResult = await apiClient.deleteCastVoteRecordFile({
    fileId: 'unknown',
  });
  expect(notFoundResult.err()).toEqual({ type: 'file-not-found' });
});

test('batches with zero cast vote records count toward scanner batch counts', async () => {
  const { apiClient, auth, peerApiClient } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  const exportDirectoryPath = castVoteRecordExport.asDirectoryPath();
  const metadata = await readExportMetadata(exportDirectoryPath);
  const templateBatch = assertDefined(metadata.batchManifest[0]);
  const { scannerId } = templateBatch;

  // A batch whose sheets were all rejected syncs as a transfer session with
  // no cast vote record uploads
  const startResult = await peerApiClient.startCvrTransfer({
    machineId: scannerId,
    batchManifest: [
      { ...templateBatch, id: 'empty-batch', label: 'Batch 99', sheetCount: 0 },
    ],
    isTestMode: isTestReport(metadata.castVoteRecordReportMetadata),
  });
  const { sessionId } = startResult.unsafeUnwrap();
  expect(
    (await peerApiClient.finishCvrTransfer({ sessionId })).unsafeUnwrap()
  ).toEqual({ newlyAdded: 0, alreadyPresent: 0 });

  await peerApiClient.registerScanner({
    machineId: scannerId,
    codeVersion: getMachineConfig().codeVersion,
  });
  expect((await apiClient.getNetworkStatus()).connectedScanners).toEqual([
    expect.objectContaining({
      machineId: scannerId,
      importedBatchCount: 1,
      importedCvrCount: 0,
    }),
  ]);

  // The import appears in the file list with its batch label
  expect(await apiClient.getCastVoteRecordFiles()).toEqual([
    expect.objectContaining({
      source: 'network',
      batchLabels: ['Batch 99'],
      numCvrsImported: 0,
    }),
  ]);

  // Deleting an unrelated import leaves the legitimately empty batch alone.
  // (The old cleanup swept ALL empty batches on any delete.)
  const otherTransferStart = await peerApiClient.startCvrTransfer({
    machineId: scannerId,
    batchManifest: metadata.batchManifest,
    isTestMode: isTestReport(metadata.castVoteRecordReportMetadata),
  });
  const { sessionId: otherSessionId } = otherTransferStart.unsafeUnwrap();
  (
    await peerApiClient.finishCvrTransfer({ sessionId: otherSessionId })
  ).unsafeUnwrap();

  const files = await apiClient.getCastVoteRecordFiles();
  expect(files).toHaveLength(2);
  const otherFile = assertDefined(
    files.find((file) => file.batchLabels[0] !== 'Batch 99')
  );
  (
    await apiClient.deleteCastVoteRecordFile({ fileId: otherFile.id })
  ).unsafeUnwrap();
  expect((await apiClient.getNetworkStatus()).connectedScanners).toEqual([
    expect.objectContaining({
      importedBatchCount: 1,
      importedCvrCount: 0,
    }),
  ]);

  // Deleting the empty import removes its batch
  const [emptyFile] = await apiClient.getCastVoteRecordFiles();
  (
    await apiClient.deleteCastVoteRecordFile({
      fileId: assertDefined(emptyFile).id,
    })
  ).unsafeUnwrap();
  expect((await apiClient.getNetworkStatus()).connectedScanners).toEqual([
    expect.objectContaining({
      importedBatchCount: 0,
      importedCvrCount: 0,
    }),
  ]);
});

test('startCvrTransfer requires a configured election', async () => {
  const { peerApiClient } = buildTestEnvironment();

  const startResult = await peerApiClient.startCvrTransfer({
    machineId: 'SCANNER-01',
    batchManifest: [],
    isTestMode: true,
  });
  expect(startResult.err()).toEqual({ type: 'no-election-configured' });
});

test('cvr upload rejects an unknown session', async () => {
  const { peerServer } = buildTestEnvironment();

  const response = await fetch(
    `${getPeerServerAddress(peerServer)}/api/cvr-transfer/unknown/cvr`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array(Buffer.from('irrelevant')),
    }
  );
  expect(response.status).toEqual(404);
  expect(await response.json()).toEqual({ error: 'session-not-found' });
});

test('cvr upload rejects invalid payloads', async () => {
  const { apiClient, auth, peerApiClient, peerServer } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  const exportDirectoryPath = castVoteRecordExport.asDirectoryPath();
  const metadata = await readExportMetadata(exportDirectoryPath);
  const startResult = await peerApiClient.startCvrTransfer({
    machineId: 'SCANNER-01',
    batchManifest: metadata.batchManifest,
    isTestMode: isTestReport(metadata.castVoteRecordReportMetadata),
  });
  const { sessionId } = startResult.unsafeUnwrap();
  const uploadUrl = `${getPeerServerAddress(
    peerServer
  )}/api/cvr-transfer/${sessionId}/cvr`;

  // A corrupt zip
  const corruptResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/zip' },
    body: new Uint8Array(Buffer.from('this is not a zip file')),
  });
  expect(corruptResponse.status).toEqual(500);
  expect(await corruptResponse.json()).toEqual({ error: 'transfer-failed' });

  // A zip without a single cast vote record directory
  const chunks: Buffer[] = [];
  const zipStream = new ZipStream();
  zipStream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  const finished = new Promise<void>((resolve, reject) => {
    zipStream.on('end', resolve);
    zipStream.on('error', reject);
  });
  await addFileToZipStream(zipStream, {
    path: 'not-a-cvr.txt',
    contents: 'irrelevant',
  });
  zipStream.finalize();
  await finished;
  const invalidContentsResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/zip' },
    body: new Uint8Array(Buffer.concat(chunks)),
  });
  expect(invalidContentsResponse.status).toEqual(400);
  expect(await invalidContentsResponse.json()).toEqual({
    error: 'invalid-zip-contents',
  });
});
