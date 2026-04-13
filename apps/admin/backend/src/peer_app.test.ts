import { beforeEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { AddressInfo } from 'node:net';
import {
  Admin,
  BallotStyleGroupId,
  DEFAULT_SYSTEM_SETTINGS,
  DEV_MACHINE_ID,
} from '@votingworks/types';
import {
  electionTwoPartyPrimaryFixtures,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import { assertDefined, err } from '@votingworks/basics';
import { buildTestEnvironment, configureMachine } from '../test/app';
import { getCurrentTime } from './get_current_time';
import {
  addMockCvrFileToStore,
  MockCastVoteRecordFile,
} from '../test/mock_cvr_file';

vi.mock('./get_current_time');

beforeEach(() => {
  vi.mocked(getCurrentTime).mockImplementation(() => Date.now());
});

test('connectToHost registers client and returns host machine config with adjudication status', async () => {
  const { peerApiClient, workspace } = buildTestEnvironment();
  const result = await peerApiClient.connectToHost({
    machineId: 'client-001',
    status: Admin.ClientMachineStatus.OnlineLocked,
    authType: null,
  });
  expect(result).toEqual({
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
    isClientAdjudicationEnabled: false,
  });

  const machines = workspace.store.getMachines();
  expect(machines).toHaveLength(1);
  expect(machines[0]).toMatchObject({
    machineId: 'client-001',
    machineMode: 'client',
    status: Admin.ClientMachineStatus.OnlineLocked,
    authType: null,
  });
});

test('connectToHost persists status and authType and returns adjudication enabled', async () => {
  const { peerApiClient, workspace } = buildTestEnvironment();

  workspace.store.setIsClientAdjudicationEnabled(true);
  const result = await peerApiClient.connectToHost({
    machineId: 'client-001',
    status: Admin.ClientMachineStatus.Active,
    authType: 'election_manager',
  });
  expect(result.isClientAdjudicationEnabled).toEqual(true);

  const machines = workspace.store.getMachines();
  expect(machines[0]).toMatchObject({
    machineId: 'client-001',
    status: Admin.ClientMachineStatus.Active,
    authType: 'election_manager',
  });
});

test('connectToHost updates store when client status changes', async () => {
  const { peerApiClient, workspace } = buildTestEnvironment();

  // First call: new client
  await peerApiClient.connectToHost({
    machineId: 'client-002',
    status: Admin.ClientMachineStatus.OnlineLocked,
    authType: null,
  });
  expect(workspace.store.getMachine('client-002')).toMatchObject({
    status: Admin.ClientMachineStatus.OnlineLocked,
    authType: null,
  });

  // Second call: status changes
  await peerApiClient.connectToHost({
    machineId: 'client-002',
    status: Admin.ClientMachineStatus.Active,
    authType: 'election_manager',
  });
  expect(workspace.store.getMachine('client-002')).toMatchObject({
    status: Admin.ClientMachineStatus.Active,
    authType: 'election_manager',
  });
});

test('getCurrentElectionMetadata returns null when no election configured', async () => {
  const { peerApiClient } = buildTestEnvironment();
  const result = await peerApiClient.getCurrentElectionMetadata();
  expect(result).toBeUndefined();
});

test('getCurrentElectionMetadata returns election record when configured', async () => {
  const { peerApiClient, apiClient, auth } = buildTestEnvironment();
  const electionDefinition = readElectionGeneralDefinition();
  await configureMachine(apiClient, auth, electionDefinition);

  const result = await peerApiClient.getCurrentElectionMetadata();
  expect(result).toBeDefined();
  expect(result?.electionDefinition.election.title).toEqual(
    electionDefinition.election.title
  );
});

test('getSystemSettings returns null when no election configured', async () => {
  const { peerApiClient } = buildTestEnvironment();
  const result = await peerApiClient.getSystemSettings();
  expect(result).toBeUndefined();
});

test('getSystemSettings returns settings when election configured', async () => {
  const { peerApiClient, apiClient, auth } = buildTestEnvironment();
  const electionDefinition = readElectionGeneralDefinition();
  await configureMachine(apiClient, auth, electionDefinition);

  const result = await peerApiClient.getSystemSettings();
  expect(result).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

function addTestCvrs(
  store: ReturnType<typeof buildTestEnvironment>['workspace']['store'],
  electionId: string,
  count: number
): string[] {
  const mockFile: MockCastVoteRecordFile = Array.from(
    { length: count },
    () => ({
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
      batchId: 'batch-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct' as const,
      votes: { 'zoo-council-mammal': ['write-in-0'] },
      card: { type: 'bmd' as const },
    })
  );
  return addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile: mockFile,
    store,
  });
}

test('claimBallot claims an unresolved CVR', async () => {
  const { peerApiClient, apiClient, auth, workspace } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  const cvrIds = addTestCvrs(workspace.store, electionId, 2);

  const result1 = await peerApiClient.claimBallot({ machineId: 'client-001' });
  expect(cvrIds).toContain(result1);

  const result2 = await peerApiClient.claimBallot({ machineId: 'client-002' });
  expect(cvrIds).toContain(result2);
  expect(result2).not.toEqual(result1);

  const result3 = await peerApiClient.claimBallot({ machineId: 'client-003' });
  expect(result3).toBeUndefined();
});

test('releaseBallot frees a claimed CVR', async () => {
  const { peerApiClient, apiClient, auth, workspace } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  addTestCvrs(workspace.store, electionId, 1);

  const cvrId = assertDefined(
    await peerApiClient.claimBallot({ machineId: 'client-001' })
  );
  await peerApiClient.releaseBallot({ machineId: 'client-001', cvrId });

  const result = await peerApiClient.claimBallot({ machineId: 'client-002' });
  expect(result).toEqual(cvrId);
});

test('setCvrResolved completes the ballot claim', async () => {
  const { peerApiClient, apiClient, auth, workspace } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  const cvrIds = addTestCvrs(workspace.store, electionId, 2);

  const claimedCvrId = assertDefined(
    await peerApiClient.claimBallot({ machineId: 'client-001' })
  );
  (
    await peerApiClient.setCvrResolved({
      machineId: 'client-001',
      cvrId: claimedCvrId,
    })
  ).unsafeUnwrap();

  // Claimed CVR is completed, not re-claimable; other CVR is next
  const result = await peerApiClient.claimBallot({ machineId: 'client-002' });
  const otherCvrId = cvrIds.find((id) => id !== claimedCvrId);
  expect(result).toEqual(otherCvrId);
});

// Minimal valid PNG: 8-byte signature + 13-byte IHDR chunk (length + type +
// data + CRC). Width=100, height=200.
function buildMinimalPng(): Buffer {
  const buf = Buffer.alloc(33);
  // PNG signature
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buf, 0);
  // IHDR chunk length (13 bytes of data)
  buf.writeUInt32BE(13, 8);
  // IHDR type
  buf.write('IHDR', 12, 'ascii');
  // Width and height
  buf.writeUInt32BE(100, 16);
  buf.writeUInt32BE(200, 20);
  // Bit depth, color type, compression, filter, interlace
  buf.writeUInt8(8, 24);
  buf.writeUInt8(2, 25);
  buf.writeUInt8(0, 26);
  buf.writeUInt8(0, 27);
  buf.writeUInt8(0, 28);
  // CRC placeholder
  buf.writeUInt32BE(0, 29);
  return buf;
}

function addCvrWithImages(
  store: ReturnType<typeof buildTestEnvironment>['workspace']['store'],
  electionId: string
): string {
  // Create a CVR without write-ins so the mock doesn't auto-add a front
  // ballot image with an invalid page layout
  const mockFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
      batchId: 'batch-img',
      scannerId: 'scanner-img',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { 'zoo-council-mammal': ['zebra'] },
      card: { type: 'bmd' },
    },
  ];
  const cvrIds = addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile: mockFile,
    store,
  });
  const cvrId = assertDefined(cvrIds[0]);
  const { electionDefinition } = assertDefined(store.getElection(electionId));
  const pngData = buildMinimalPng();

  // Add both front and back images with valid PNG data
  store.addBallotImage({
    cvrId,
    electionDefinitionId: electionDefinition.election.id,
    imageData: pngData,
    side: 'front',
  });
  store.addBallotImage({
    cvrId,
    electionDefinitionId: electionDefinition.election.id,
    imageData: pngData,
    side: 'back',
  });

  return cvrId;
}

function getPeerBaseUrl(env: ReturnType<typeof buildTestEnvironment>): string {
  const { port } = env.peerServer.address() as AddressInfo;
  return `http://localhost:${port}`;
}

test('GET /api/ballot-image/:cvrId/:side returns binary image', async () => {
  const env = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await configureMachine(
    env.apiClient,
    env.auth,
    electionDefinition
  );
  const cvrId = addCvrWithImages(env.workspace.store, electionId);
  const baseUrl = getPeerBaseUrl(env);

  const frontResponse = await fetch(
    `${baseUrl}/api/ballot-image/${cvrId}/front`
  );
  expect(frontResponse.status).toEqual(200);
  expect(frontResponse.headers.get('content-type')).toEqual('image/png');
  const frontBuffer = Buffer.from(await frontResponse.arrayBuffer());
  expect(frontBuffer.length).toBeGreaterThan(0);

  const backResponse = await fetch(`${baseUrl}/api/ballot-image/${cvrId}/back`);
  expect(backResponse.status).toEqual(200);
  expect(backResponse.headers.get('content-type')).toEqual('image/png');
});

test('GET /api/ballot-image/:cvrId/:side returns 400 for invalid side', async () => {
  const env = buildTestEnvironment();
  const baseUrl = getPeerBaseUrl(env);

  const response = await fetch(`${baseUrl}/api/ballot-image/cvr-1/top`);
  expect(response.status).toEqual(400);
  const body = await response.json();
  expect(body).toEqual({ error: 'side must be "front" or "back"' });
});

test('GET /api/ballot-image/:cvrId/:side returns 404 when CVR has no stored images', async () => {
  const env = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await configureMachine(
    env.apiClient,
    env.auth,
    electionDefinition
  );
  // Create CVR without ballot images — getBallotImagesAndLayouts throws
  const cvrIds = addTestCvrs(env.workspace.store, electionId, 1);
  const cvrId = assertDefined(cvrIds[0]);
  const baseUrl = getPeerBaseUrl(env);

  const response = await fetch(`${baseUrl}/api/ballot-image/${cvrId}/front`);
  expect(response.status).toEqual(404);
});

test('GET /api/ballot-image/:cvrId/:side returns 404 for unknown CVR', async () => {
  const env = buildTestEnvironment();
  const baseUrl = getPeerBaseUrl(env);

  const response = await fetch(`${baseUrl}/api/ballot-image/nonexistent/front`);
  expect(response.status).toEqual(404);
});

test('getBallotImageMetadata returns metadata with image URLs', async () => {
  const env = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await configureMachine(
    env.apiClient,
    env.auth,
    electionDefinition
  );
  const cvrId = addCvrWithImages(env.workspace.store, electionId);

  const metadata = await env.peerApiClient.getBallotImageMetadata({ cvrId });
  expect(metadata.cvrId).toEqual(cvrId);
  expect(metadata.front.imageUrl).toEqual(`/api/ballot-image/${cvrId}/front`);
  expect(metadata.back.imageUrl).toEqual(`/api/ballot-image/${cvrId}/back`);
  expect(metadata.front.ballotCoordinates).toEqual({
    x: 0,
    y: 0,
    width: 100,
    height: 200,
  });
});

test('adjudicateCvrContest returns no-claim when machine has no claim', async () => {
  const { peerApiClient, apiClient, auth, workspace } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  const cvrIds = addTestCvrs(workspace.store, electionId, 1);

  const result = await peerApiClient.adjudicateCvrContest({
    machineId: 'unknown-machine',
    cvrId: cvrIds[0]!,
    contestId: 'zoo-council-mammal',
    side: 'front',
    adjudicatedContestOptionById: {},
  });
  expect(result).toEqual(err({ type: 'no-claim' }));
});

test('setCvrResolved returns no-claim when machine has no claim', async () => {
  const { peerApiClient, apiClient, auth, workspace } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  const cvrIds = addTestCvrs(workspace.store, electionId, 1);

  const result = await peerApiClient.setCvrResolved({
    machineId: 'unknown-machine',
    cvrId: cvrIds[0]!,
  });
  expect(result).toEqual(err({ type: 'no-claim' }));
});
