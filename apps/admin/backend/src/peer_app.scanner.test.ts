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

test('registerScanner records a compatible scanner in the machines table', async () => {
  const { peerApiClient, workspace } = buildTestEnvironment();
  const machineConfig = getMachineConfig();

  const result = await peerApiClient.registerScanner({
    machineId: 'SCANNER-01',
    codeVersion: machineConfig.codeVersion,
  });
  expect(result).toEqual({ ...machineConfig, isCompatible: true });
  expect(workspace.store.getMachine('SCANNER-01')).toMatchObject({
    machineId: 'SCANNER-01',
    machineMode: 'scanner',
    status: Admin.ClientMachineStatus.Active,
  });
});

test('registerScanner rejects a scanner running a different code version', async () => {
  const { peerApiClient, workspace } = buildTestEnvironment();
  const machineConfig = getMachineConfig();

  const result = await peerApiClient.registerScanner({
    machineId: 'SCANNER-02',
    codeVersion: 'some-other-version',
  });
  expect(result).toEqual({ ...machineConfig, isCompatible: false });
  expect(workspace.store.getMachine('SCANNER-02')).toBeUndefined();
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
