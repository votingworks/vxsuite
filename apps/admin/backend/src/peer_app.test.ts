import { beforeEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { AddressInfo } from 'node:net';
import {
  Admin,
  DEFAULT_SYSTEM_SETTINGS,
  DEV_MACHINE_ID,
} from '@votingworks/types';
import {
  electionTwoPartyPrimaryFixtures,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import { assertDefined, err, ok, range } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import type { Result } from '@votingworks/basics';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app.js';
import { getCurrentTime } from './get_current_time.js';
import {
  addMockCvrFileToStore,
  MockCastVoteRecordFile,
} from '../test/mock_cvr_file.js';

vi.mock('./get_current_time');

// Test helper: wraps the unified claimAndLoadBallot endpoint and returns
// just the claimed cvrId (or undefined) to match the pre-collapse
// claimBallot signature that these tests were written against.
async function claimBallot(
  peerApiClient: {
    claimAndLoadBallot: (input: {
      machineId: string;
      afterCvrId?: string;
    }) => Promise<Result<{ cvrId: string } | undefined, unknown>>;
  },
  input: { machineId: string; afterCvrId?: string }
): Promise<string | undefined> {
  const result = await peerApiClient.claimAndLoadBallot(input);
  return result.unsafeUnwrap()?.cvrId;
}

beforeEach(() => {
  vi.mocked(getCurrentTime).mockImplementation(() => Date.now());
});

test('registerAdjudicationStation registers client and returns host machine config with adjudication status', async () => {
  const { peerApiClient, workspace } = buildTestEnvironment();
  const result = await peerApiClient.registerAdjudicationStation({
    machineId: 'client-001',
    codeVersion: 'dev',
    status: Admin.ClientMachineStatus.OnlineLocked,
    authType: null,
  });
  expect(result).toEqual(
    ok({
      machineId: DEV_MACHINE_ID,
      codeVersion: 'dev',
      isClientAdjudicationEnabled: false,
    })
  );

  const machines = workspace.store.getMachines();
  expect(machines).toHaveLength(1);
  expect(machines[0]).toMatchObject({
    machineId: 'client-001',
    machineRole: 'admin-client',
    status: Admin.ClientMachineStatus.OnlineLocked,
    authType: null,
  });
});

test('registerAdjudicationStation rejects a client running an incompatible code version', async () => {
  const { peerApiClient, workspace } = buildTestEnvironment();
  workspace.store.setIsClientAdjudicationEnabled(true);

  const result = await peerApiClient.registerAdjudicationStation({
    machineId: 'client-001',
    codeVersion: 'an-incompatible-version',
    status: Admin.ClientMachineStatus.Active,
    authType: 'election_manager',
  });

  expect(result).toEqual(err({ type: 'code-version-mismatch' }));

  // The incompatible station is still recorded, with the error, so it can be
  // shown in the host's UI.
  expect(workspace.store.getMachines()).toEqual([
    expect.objectContaining({
      machineId: 'client-001',
      machineRole: 'admin-client',
      registrationError: 'code-version-mismatch',
    }),
  ]);
});

test('registerAdjudicationStation persists status and authType and returns adjudication enabled', async () => {
  const { peerApiClient, workspace } = buildTestEnvironment();

  workspace.store.setIsClientAdjudicationEnabled(true);
  const result = await peerApiClient.registerAdjudicationStation({
    machineId: 'client-001',
    codeVersion: 'dev',
    status: Admin.ClientMachineStatus.Active,
    authType: 'election_manager',
  });
  expect(result.unsafeUnwrap().isClientAdjudicationEnabled).toEqual(true);

  const machines = workspace.store.getMachines();
  expect(machines[0]).toMatchObject({
    machineId: 'client-001',
    status: Admin.ClientMachineStatus.Active,
    authType: 'election_manager',
  });
});

test("registerAdjudicationStation releases the client's claims when it transitions to OnlineLocked", async () => {
  const { peerApiClient, apiClient, auth, workspace } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  addTestCvrs(workspace.store, electionId, 2);
  workspace.store.setIsClientAdjudicationEnabled(true);

  // Client logs in (Active) and claims a ballot.
  (
    await peerApiClient.registerAdjudicationStation({
      machineId: 'client-001',
      codeVersion: 'dev',
      status: Admin.ClientMachineStatus.Active,
      authType: 'election_manager',
    })
  ).unsafeUnwrap();
  const cvrId = assertDefined(
    await claimBallot(peerApiClient, { machineId: 'client-001' })
  );

  // Client transitions to OnlineLocked (logout / session expiry).
  (
    await peerApiClient.registerAdjudicationStation({
      machineId: 'client-001',
      codeVersion: 'dev',
      status: Admin.ClientMachineStatus.OnlineLocked,
      authType: null,
    })
  ).unsafeUnwrap();

  // The claim should be released — another machine can now pick it up.
  const result = await claimBallot(peerApiClient, { machineId: 'client-002' });
  expect(result).toEqual(cvrId);
});

test('registerAdjudicationStation does not release claims when status stays Active or transitions Active→Adjudicating', async () => {
  const { peerApiClient, apiClient, auth, workspace } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  addTestCvrs(workspace.store, electionId, 1);
  workspace.store.setIsClientAdjudicationEnabled(true);

  (
    await peerApiClient.registerAdjudicationStation({
      machineId: 'client-001',
      codeVersion: 'dev',
      status: Admin.ClientMachineStatus.Active,
      authType: 'election_manager',
    })
  ).unsafeUnwrap();
  const cvrId = assertDefined(
    await claimBallot(peerApiClient, { machineId: 'client-001' })
  );

  // Repeated heartbeats with the same Active status should not release.
  (
    await peerApiClient.registerAdjudicationStation({
      machineId: 'client-001',
      codeVersion: 'dev',
      status: Admin.ClientMachineStatus.Active,
      authType: 'election_manager',
    })
  ).unsafeUnwrap();
  // Another machine still cannot claim it.
  expect(
    await claimBallot(peerApiClient, { machineId: 'client-002' })
  ).toBeUndefined();

  // Active → Adjudicating must not release either.
  (
    await peerApiClient.registerAdjudicationStation({
      machineId: 'client-001',
      codeVersion: 'dev',
      status: Admin.ClientMachineStatus.Adjudicating,
      authType: 'election_manager',
    })
  ).unsafeUnwrap();
  expect(
    await claimBallot(peerApiClient, { machineId: 'client-002' })
  ).toBeUndefined();
  expect(cvrId).toBeDefined();
});

test('registerAdjudicationStation updates store when client status changes', async () => {
  const { peerApiClient, workspace } = buildTestEnvironment();

  // First call: new client
  (
    await peerApiClient.registerAdjudicationStation({
      machineId: 'client-002',
      codeVersion: 'dev',
      status: Admin.ClientMachineStatus.OnlineLocked,
      authType: null,
    })
  ).unsafeUnwrap();
  expect(workspace.store.getMachine('client-002')).toMatchObject({
    status: Admin.ClientMachineStatus.OnlineLocked,
    authType: null,
  });

  // Second call: status changes
  (
    await peerApiClient.registerAdjudicationStation({
      machineId: 'client-002',
      codeVersion: 'dev',
      status: Admin.ClientMachineStatus.Active,
      authType: 'election_manager',
    })
  ).unsafeUnwrap();
  expect(workspace.store.getMachine('client-002')).toMatchObject({
    status: Admin.ClientMachineStatus.Active,
    authType: 'election_manager',
  });
});

test('registerScanner records the scanner and returns the host machine config', async () => {
  const { peerApiClient, apiClient, auth, workspace } = buildTestEnvironment();
  const electionDefinition = readElectionGeneralDefinition();
  await configureMachine(apiClient, auth, electionDefinition);
  expect(
    await peerApiClient.registerScanner({
      machineId: 'SCANNER-01',
      isTestMode: true,
      codeVersion: 'dev',
      ballotHash: electionDefinition.ballotHash,
    })
  ).toEqual(
    ok({
      machineId: DEV_MACHINE_ID,
      codeVersion: 'dev',
      importedBatchIds: [],
    })
  );
  expect(workspace.store.getMachines()).toEqual([
    expect.objectContaining({
      machineId: 'SCANNER-01',
      machineRole: 'scanner',
      status: Admin.ClientMachineStatus.Active,
    }),
  ]);
});

test('registerScanner refuses a scanner once results are marked official', async () => {
  const { peerApiClient, apiClient, auth, workspace } = buildTestEnvironment();
  const electionDefinition = readElectionGeneralDefinition();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);
  await apiClient.markResultsOfficial();

  expect(
    await peerApiClient.registerScanner({
      machineId: 'SCANNER-01',
      codeVersion: 'dev',
      ballotHash: electionDefinition.ballotHash,
      isTestMode: true,
    })
  ).toEqual(err({ type: 'results-official' }));
  expect(workspace.store.getMachines()).toEqual([
    expect.objectContaining({
      machineId: 'SCANNER-01',
      registrationError: 'results-official',
    }),
  ]);
});

test('registerScanner refuses an official-mode scanner once test CVRs lock the mode', async () => {
  const { peerApiClient, apiClient, auth, workspace, peerLogger } =
    buildTestEnvironment();
  const electionDefinition = readElectionGeneralDefinition();
  await configureMachine(apiClient, auth, electionDefinition);
  const electionId = assertDefined(workspace.store.getCurrentElectionId());
  workspace.store.addCastVoteRecordFileRecord({
    id: 'test-import',
    electionId,
    isTestMode: true,
    filename: 'test-export',
    exportedTimestamp: new Date().toISOString(),
    scannerIds: new Set(['SCANNER-02']),
    pollingPlaceIds: new Set(),
    batchIds: [],
    source: { type: 'usb', sha256Hash: 'test-hash' },
  });

  expect(
    await peerApiClient.registerScanner({
      machineId: 'SCANNER-01',
      codeVersion: 'dev',
      ballotHash: electionDefinition.ballotHash,
      isTestMode: false,
    })
  ).toEqual(err({ type: 'invalid-mode', currentMode: 'test' }));
  expect(peerLogger.log).toHaveBeenCalledWith(
    LogEventId.AdminNetworkStatus,
    'system',
    expect.objectContaining({
      disposition: 'failure',
      message: expect.stringContaining(
        'tabulating test ballots and the scanner is in official ballot mode'
      ),
    })
  );
});

test('registerScanner refuses a scanner in the other ballot mode once CVRs lock the mode', async () => {
  const { peerApiClient, apiClient, auth, workspace } = buildTestEnvironment();
  const electionDefinition = readElectionGeneralDefinition();
  await configureMachine(apiClient, auth, electionDefinition);
  const electionId = assertDefined(workspace.store.getCurrentElectionId());

  function register(isTestMode: boolean) {
    return peerApiClient.registerScanner({
      machineId: 'SCANNER-01',
      codeVersion: 'dev',
      ballotHash: electionDefinition.ballotHash,
      isTestMode,
    });
  }

  const registered = ok({
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
    importedBatchIds: [],
  });
  // With no CVRs loaded yet, a scanner in either mode registers
  expect(await register(false)).toEqual(registered);
  expect(await register(true)).toEqual(registered);

  // An official import locks the mode
  workspace.store.addCastVoteRecordFileRecord({
    id: 'official-import',
    electionId,
    isTestMode: false,
    filename: 'official-export',
    exportedTimestamp: new Date().toISOString(),
    scannerIds: new Set(['SCANNER-02']),
    pollingPlaceIds: new Set(),
    batchIds: [],
    source: { type: 'usb', sha256Hash: 'test-hash' },
  });
  expect(await register(true)).toEqual(
    err({ type: 'invalid-mode', currentMode: 'official' })
  );
  expect(workspace.store.getMachines()).toEqual([
    expect.objectContaining({
      machineId: 'SCANNER-01',
      registrationError: 'invalid-mode',
    }),
  ]);
  expect(await register(false)).toEqual(registered);
  expect(workspace.store.getMachines()).toEqual([
    expect.objectContaining({
      machineId: 'SCANNER-01',
      registrationError: null,
    }),
  ]);
});

test('registerScanner records a scanner configured for a different election with an error', async () => {
  const { peerApiClient, apiClient, auth, peerLogger, workspace } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, readElectionGeneralDefinition());
  expect(
    await peerApiClient.registerScanner({
      machineId: 'SCANNER-01',
      isTestMode: true,
      codeVersion: 'dev',
      ballotHash: 'some-other-ballot-hash',
    })
  ).toEqual(err({ type: 'ballot-hash-mismatch' }));
  expect(workspace.store.getMachines()).toEqual([
    expect.objectContaining({
      machineId: 'SCANNER-01',
      registrationError: 'ballot-hash-mismatch',
    }),
  ]);
  expect(peerLogger.log).toHaveBeenCalledWith(
    LogEventId.AdminNetworkStatus,
    'system',
    expect.objectContaining({
      disposition: 'failure',
      scannerMachineId: 'SCANNER-01',
      scannerBallotHash: 'some-other-ballot-hash',
    })
  );
});

test('registerScanner records an unconfigured scanner with an error', async () => {
  const { peerApiClient, apiClient, auth, workspace } = buildTestEnvironment();
  await configureMachine(apiClient, auth, readElectionGeneralDefinition());
  expect(
    await peerApiClient.registerScanner({
      machineId: 'SCANNER-01',
      isTestMode: true,
      codeVersion: 'dev',
    })
  ).toEqual(err({ type: 'scanner-unconfigured' }));
  expect(workspace.store.getMachines()).toEqual([
    expect.objectContaining({
      machineId: 'SCANNER-01',
      registrationError: 'scanner-unconfigured',
    }),
  ]);
});

test('registerScanner records a scanner with an error when the host is unconfigured', async () => {
  const { peerApiClient, workspace } = buildTestEnvironment();
  expect(
    await peerApiClient.registerScanner({
      machineId: 'SCANNER-01',
      isTestMode: true,
      codeVersion: 'dev',
      ballotHash: readElectionGeneralDefinition().ballotHash,
    })
  ).toEqual(err({ type: 'host-unconfigured' }));
  expect(workspace.store.getMachines()).toEqual([
    expect.objectContaining({
      machineId: 'SCANNER-01',
      registrationError: 'host-unconfigured',
    }),
  ]);
});

test('registerScanner records a scanner running an incompatible code version with an error', async () => {
  const { peerApiClient, peerLogger, workspace } = buildTestEnvironment();
  expect(
    await peerApiClient.registerScanner({
      machineId: 'SCANNER-01',
      isTestMode: true,
      codeVersion: 'some-other-version',
    })
  ).toEqual(err({ type: 'code-version-mismatch' }));
  expect(workspace.store.getMachines()).toEqual([
    expect.objectContaining({
      machineId: 'SCANNER-01',
      machineRole: 'scanner',
      registrationError: 'code-version-mismatch',
    }),
  ]);
  expect(peerLogger.log).toHaveBeenCalledWith(
    LogEventId.AdminNetworkStatus,
    'system',
    expect.objectContaining({
      disposition: 'failure',
      scannerMachineId: 'SCANNER-01',
      scannerCodeVersion: 'some-other-version',
      hostCodeVersion: 'dev',
    })
  );
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
      ballotStyleGroupId: '1M',
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
    pollingPlaceId: 'polling-place-1',
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
  workspace.store.setIsClientAdjudicationEnabled(true);

  const result1 = await claimBallot(peerApiClient, { machineId: 'client-001' });
  expect(cvrIds).toContain(result1);

  const result2 = await claimBallot(peerApiClient, { machineId: 'client-002' });
  expect(cvrIds).toContain(result2);
  expect(result2).not.toEqual(result1);

  const result3 = await claimBallot(peerApiClient, { machineId: 'client-003' });
  expect(result3).toBeUndefined();
});

test('parallel claims from more machines than ballots assign each ballot exactly once', async () => {
  const { peerApiClient, apiClient, auth, workspace } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  const cvrIds = addTestCvrs(workspace.store, electionId, 3);
  workspace.store.setIsClientAdjudicationEnabled(true);

  const results = await Promise.all(
    range(1, 6).map((i) =>
      claimBallot(peerApiClient, { machineId: `client-00${i}` })
    )
  );

  const claimedIds = results.filter((cvrId) => cvrId !== undefined);
  expect([...claimedIds].sort()).toEqual([...cvrIds].sort());
  expect(results.filter((cvrId) => cvrId === undefined)).toHaveLength(2);
});

test('releaseBallot frees a claimed CVR', async () => {
  const { peerApiClient, apiClient, auth, workspace, peerLogger } =
    buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  addTestCvrs(workspace.store, electionId, 1);
  workspace.store.setIsClientAdjudicationEnabled(true);

  const cvrId = assertDefined(
    await claimBallot(peerApiClient, { machineId: 'client-001' })
  );
  expect(peerLogger.log).toHaveBeenCalledWith(
    LogEventId.AdminBallotClaimed,
    'system',
    expect.objectContaining({
      disposition: 'success',
      clientMachineId: 'client-001',
    })
  );

  await peerApiClient.releaseBallot({ machineId: 'client-001', cvrId });
  expect(peerLogger.log).toHaveBeenCalledWith(
    LogEventId.AdminBallotReleased,
    'system',
    expect.objectContaining({ clientMachineId: 'client-001' })
  );

  const result = await claimBallot(peerApiClient, { machineId: 'client-002' });
  expect(result).toEqual(cvrId);
});

test("releaseBallot does not release another machine's claim", async () => {
  const { peerApiClient, apiClient, auth, workspace } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  addTestCvrs(workspace.store, electionId, 1);
  workspace.store.setIsClientAdjudicationEnabled(true);

  const cvrId = assertDefined(
    await claimBallot(peerApiClient, { machineId: 'client-001' })
  );

  // Another machine attempting to release the ballot is a no-op — the claim
  // survives and the ballot stays unavailable
  await peerApiClient.releaseBallot({ machineId: 'client-002', cvrId });
  expect(
    await claimBallot(peerApiClient, { machineId: 'client-002' })
  ).toBeUndefined();

  // The owning machine can release it
  await peerApiClient.releaseBallot({ machineId: 'client-001', cvrId });
  expect(await claimBallot(peerApiClient, { machineId: 'client-002' })).toEqual(
    cvrId
  );
});

test('claimAndLoadBallot advances past a just-completed ballot', async () => {
  const { peerApiClient, apiClient, auth, workspace } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  addTestCvrs(workspace.store, electionId, 3);
  workspace.store.setIsClientAdjudicationEnabled(true);

  // Arrange for client-001 to hold the SECOND ballot in queue order, with
  // the first ballot released back to the pool. The accept-and-next cursor
  // must then continue forward from the completed ballot's queue position,
  // not restart from the front.
  const first = assertDefined(
    await claimBallot(peerApiClient, { machineId: 'client-002' })
  );
  const second = assertDefined(
    await claimBallot(peerApiClient, { machineId: 'client-001' })
  );
  await peerApiClient.releaseBallot({ machineId: 'client-002', cvrId: first });

  (
    await peerApiClient.adjudicateCvr({
      machineId: 'client-001',
      cvrId: second,
      contests: [],
    })
  ).unsafeUnwrap();

  // The client's accept-and-next flow uses the ballot it just completed as
  // the cursor — the anchor must still resolve even though that ballot is
  // now adjudicated
  const next = await claimBallot(peerApiClient, {
    machineId: 'client-001',
    afterCvrId: second,
  });
  expect(next).toBeDefined();
  expect(next).not.toEqual(first);
  expect(next).not.toEqual(second);
});

test('adjudicateCvr completes the ballot claim', async () => {
  const { peerApiClient, apiClient, auth, workspace, peerLogger } =
    buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  const cvrIds = addTestCvrs(workspace.store, electionId, 2);
  workspace.store.setIsClientAdjudicationEnabled(true);

  const claimedCvrId = assertDefined(
    await claimBallot(peerApiClient, { machineId: 'client-001' })
  );
  (
    await peerApiClient.adjudicateCvr({
      machineId: 'client-001',
      cvrId: claimedCvrId,
      contests: [],
    })
  ).unsafeUnwrap();
  expect(peerLogger.log).toHaveBeenCalledWith(
    LogEventId.AdminBallotAdjudicationComplete,
    'system',
    expect.objectContaining({ disposition: 'success' })
  );

  // The completed claim is no longer an active claim — re-adjudicating the
  // same ballot without a fresh claim is rejected
  expect(
    await peerApiClient.adjudicateCvr({
      machineId: 'client-001',
      cvrId: claimedCvrId,
      contests: [],
    })
  ).toEqual(err({ type: 'claim-failed' }));

  // Claimed CVR is completed, not re-claimable; other CVR is next
  const result = await claimBallot(peerApiClient, { machineId: 'client-002' });
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
      ballotStyleGroupId: '1M',
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
    pollingPlaceId: 'polling-place-1',
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

test('adjudicateCvr returns claim-failed when machine has no claim', async () => {
  const { peerApiClient, apiClient, auth, workspace } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  const cvrIds = addTestCvrs(workspace.store, electionId, 1);
  workspace.store.setIsClientAdjudicationEnabled(true);

  const result = await peerApiClient.adjudicateCvr({
    machineId: 'unknown-machine',
    cvrId: cvrIds[0]!,
    contests: [],
  });
  expect(result).toEqual(err({ type: 'claim-failed' }));
});

test('adjudication endpoints reject requests when client adjudication is disabled', async () => {
  const { peerApiClient, apiClient, auth, workspace } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  const cvrIds = addTestCvrs(workspace.store, electionId, 1);
  const cvrId = assertDefined(cvrIds[0]);

  // Client adjudication was never enabled — claims and adjudications are
  // rejected at the peer API even if a client tries anyway
  expect(
    await peerApiClient.claimAndLoadBallot({ machineId: 'client-001' })
  ).toEqual(err({ type: 'adjudication-disabled' }));
  expect(
    await peerApiClient.adjudicateCvr({
      machineId: 'client-001',
      cvrId,
      contests: [],
    })
  ).toEqual(err({ type: 'adjudication-disabled' }));
});

test('adjudication endpoints reject requests when multiple hosts are detected', async () => {
  const { peerApiClient, apiClient, auth, workspace } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  addTestCvrs(workspace.store, electionId, 1);
  workspace.store.setIsClientAdjudicationEnabled(true);

  const cvrId = assertDefined(
    await claimBallot(peerApiClient, { machineId: 'client-001' })
  );

  // A second host appears on the network
  workspace.store.setNetworkedMachineStatus(
    'other-host',
    'admin-host',
    Admin.ClientMachineStatus.Active
  );

  expect(
    await peerApiClient.claimAndLoadBallot({ machineId: 'client-002' })
  ).toEqual(err({ type: 'adjudication-disabled' }));
  expect(
    await peerApiClient.adjudicateCvr({
      machineId: 'client-001',
      cvrId,
      contests: [],
    })
  ).toEqual(err({ type: 'adjudication-disabled' }));

  // Release requests are ignored while adjudication is not allowed — claim
  // cleanup is the host's responsibility in this state
  await peerApiClient.releaseBallot({ machineId: 'client-001', cvrId });
  expect(
    workspace.store.hasBallotClaim({
      electionId,
      cvrId,
      machineId: 'client-001',
    })
  ).toEqual(true);

  // Once the other host goes offline, adjudication operations resume
  workspace.store.setNetworkedMachineStatus(
    'other-host',
    'admin-host',
    Admin.ClientMachineStatus.Offline
  );
  await peerApiClient.releaseBallot({ machineId: 'client-001', cvrId });
  expect(await claimBallot(peerApiClient, { machineId: 'client-002' })).toEqual(
    cvrId
  );
});
