import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs/promises';
import { AddressInfo } from 'node:net';
import path from 'node:path';
import { assert, assertDefined, err, ok } from '@votingworks/basics';
import {
  authenticateArtifactUsingSignatureFile,
  mockSigningMachineCertFields,
} from '@votingworks/auth';
import { readCastVoteRecordExportMetadata } from '@votingworks/backend';
import {
  electionPrimaryPrecinctSplitsFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import { getCvrTransferUploadPath } from '@votingworks/networking';
import {
  BooleanEnvironmentVariableName,
  getEntries,
  getFeatureFlagMock,
  openZip,
  readEntry,
} from '@votingworks/utils';
import { zipFile } from '@votingworks/test-utils';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app.js';

vi.setConfig({
  testTimeout: 60_000,
});

vi.mock(import('@votingworks/auth'), async (importActual) => ({
  ...(await importActual()),
  authenticateArtifactUsingSignatureFile: vi.fn(),
}));

// mock SKIP_CVR_BALLOT_HASH_CHECK to allow us to use old cvr fixtures
const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticateArtifactUsingSignatureFile).mockResolvedValue(
    ok(mockSigningMachineCertFields({ component: 'central-scan' }))
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CVR_BALLOT_HASH_CHECK
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

const electionDefinition =
  electionTwoPartyPrimaryFixtures.readElectionDefinition();

const SCANNER_ID = 'CS-01';

interface FixtureBatch {
  batchId: string;
  label: string;
  pollingPlaceId: string;
  startedAt: string;
  sheetCount: number;
  cvrs: Array<{ id: string; zip: Buffer }>;
}

/**
 * Loads the first batch of the two-party-primary CVR export fixture as
 * upload-ready zips, one per cast vote record.
 */
async function loadFixtureBatch(
  fixtures: {
    castVoteRecordExport: { asDirectoryPath(): string };
  } = electionTwoPartyPrimaryFixtures
): Promise<FixtureBatch> {
  const exportDirectoryPath = fixtures.castVoteRecordExport.asDirectoryPath();
  const metadata = (
    await readCastVoteRecordExportMetadata(exportDirectoryPath)
  ).unsafeUnwrap();
  const batch = assertDefined(metadata.batchManifest[0]);

  const cvrs: FixtureBatch['cvrs'] = [];
  const entries = await fs.readdir(exportDirectoryPath, {
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const castVoteRecordDirectoryPath = path.join(
      exportDirectoryPath,
      entry.name
    );
    const report = JSON.parse(
      await fs.readFile(
        path.join(castVoteRecordDirectoryPath, 'cast-vote-record-report.json'),
        'utf-8'
      )
    ) as { CVR: Array<{ BatchId: string }> };
    if (assertDefined(report.CVR[0]).BatchId !== batch.id) continue;

    const files: Record<string, Buffer> = {};
    for (const fileName of await fs.readdir(castVoteRecordDirectoryPath)) {
      files[fileName] = await fs.readFile(
        path.join(castVoteRecordDirectoryPath, fileName)
      );
    }
    cvrs.push({ id: entry.name, zip: await zipFile(files) });
  }

  return {
    batchId: batch.id,
    label: batch.label,
    pollingPlaceId: batch.pollingPlaceId,
    startedAt: batch.startTime,
    sheetCount: cvrs.length,
    cvrs,
  };
}

/** Re-packs a fixture zip after letting `mutate` alter its files. */
type ZipFiles = Record<string, Buffer>;

async function rezip(
  zip: Buffer,
  mutate: (files: ZipFiles) => ZipFiles
): Promise<Buffer> {
  const files: ZipFiles = {};
  for (const entry of getEntries(await openZip(zip))) {
    files[entry.name] = await readEntry(entry);
  }
  return await zipFile(mutate(files));
}

function editReport(
  files: ZipFiles,
  edit: (report: { CVR: Array<Record<string, unknown>> }) => void
): ZipFiles {
  const report = JSON.parse(
    assertDefined(files['cast-vote-record-report.json']).toString('utf-8')
  );
  edit(report);
  return {
    ...files,
    'cast-vote-record-report.json': Buffer.from(JSON.stringify(report)),
  };
}

/** Replaces the contents of every file whose name matches `suffix`. */
function replaceFiles(
  files: ZipFiles,
  suffix: string,
  contents: string
): ZipFiles {
  return Object.fromEntries(
    Object.entries(files).map(([name, data]) => [
      name,
      name.endsWith(suffix) ? Buffer.from(contents) : data,
    ])
  );
}

async function uploadZip(
  baseUrl: string,
  batch: FixtureBatch,
  cvrId: string,
  zip: Buffer,
  scannerId = SCANNER_ID
): Promise<Response> {
  return await fetch(
    baseUrl + getCvrTransferUploadPath(scannerId, batch.batchId, cvrId),
    {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array(zip),
    }
  );
}

function startInput(
  batch: FixtureBatch,
  overrides: Record<string, unknown> = {}
) {
  return {
    machineId: SCANNER_ID,
    batchId: batch.batchId,
    label: batch.label,
    pollingPlaceId: batch.pollingPlaceId,
    sheetCount: batch.sheetCount,
    startedAt: batch.startedAt,
    isTestMode: true,
    codeVersion: 'dev',
    ballotHash: electionDefinition.ballotHash,
    ...overrides,
  };
}

function peerBaseUrl(peerServer: { address: () => unknown }): string {
  const { port } = peerServer.address() as AddressInfo;
  return `http://localhost:${port}`;
}

async function uploadCvr(
  baseUrl: string,
  batch: FixtureBatch,
  cvr: FixtureBatch['cvrs'][number],
  scannerId = SCANNER_ID
): Promise<Response> {
  return await fetch(
    baseUrl + getCvrTransferUploadPath(scannerId, batch.batchId, cvr.id),
    {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array(cvr.zip),
    }
  );
}

test('transfers a batch end to end, idempotently', async () => {
  const { apiClient, auth, peerApiClient, peerServer, workspace } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  const electionId = assertDefined(workspace.store.getCurrentElectionId());
  const batch = await loadFixtureBatch();
  expect(batch.sheetCount).toBeGreaterThan(0);
  const baseUrl = peerBaseUrl(peerServer);

  expect(await peerApiClient.startCvrTransfer(startInput(batch))).toEqual(
    ok({ alreadyComplete: false })
  );

  for (const cvr of batch.cvrs) {
    const response = await uploadCvr(baseUrl, batch, cvr);
    expect(response.status).toEqual(200);
  }

  // Uploaded records are staged only: nothing is visible to any other
  // consumer (and no CVR-change triggers have fired) until finish.
  expect(workspace.store.getCvrFiles(electionId)).toHaveLength(0);
  expect(workspace.store.getCastVoteRecordsDataVersion(electionId)).toEqual(0);

  expect(
    await peerApiClient.finishCvrTransfer({
      machineId: SCANNER_ID,
      batchId: batch.batchId,
    })
  ).toEqual(ok({ cvrCount: batch.sheetCount }));

  expect(
    workspace.store.getCastVoteRecordsDataVersion(electionId)
  ).toBeGreaterThan(0);

  const cvrFiles = workspace.store.getCvrFiles(electionId);
  expect(cvrFiles).toHaveLength(1);
  expect(cvrFiles[0]).toMatchObject({
    filename: batch.label,
    numCvrsImported: batch.sheetCount,
  });

  // Finish is idempotent
  expect(
    await peerApiClient.finishCvrTransfer({
      machineId: SCANNER_ID,
      batchId: batch.batchId,
    })
  ).toEqual(ok({ cvrCount: batch.sheetCount }));

  // Re-starting a completed transfer reports it as already complete
  expect(await peerApiClient.startCvrTransfer(startInput(batch))).toEqual(
    ok({ alreadyComplete: true })
  );
  expect(workspace.store.getCvrFiles(electionId)).toHaveLength(1);
});

test('uploads may arrive in any order and be repeated', async () => {
  const { apiClient, auth, peerApiClient, peerServer, workspace } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  const electionId = assertDefined(workspace.store.getCurrentElectionId());
  const batch = await loadFixtureBatch();
  const baseUrl = peerBaseUrl(peerServer);

  expect(await peerApiClient.startCvrTransfer(startInput(batch))).toEqual(
    ok({ alreadyComplete: false })
  );
  // Reverse order, with the first few sent twice (e.g. a retried upload
  // whose acknowledgment was lost)
  const uploads = [...batch.cvrs].reverse().concat(batch.cvrs.slice(0, 3));
  for (const cvr of uploads) {
    expect((await uploadCvr(baseUrl, batch, cvr)).status).toEqual(200);
  }
  expect(
    workspace.store.getStagedCvrCount(electionId, SCANNER_ID, batch.batchId)
  ).toEqual(batch.sheetCount);

  expect(
    await peerApiClient.finishCvrTransfer({
      machineId: SCANNER_ID,
      batchId: batch.batchId,
    })
  ).toEqual(ok({ cvrCount: batch.sheetCount }));
  expect(workspace.store.getCvrFiles(electionId)[0]?.numCvrsImported).toEqual(
    batch.sheetCount
  );
});

test('an interrupted transfer resumes and completes', async () => {
  const { apiClient, auth, peerApiClient, peerServer, workspace } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  const electionId = assertDefined(workspace.store.getCurrentElectionId());
  const batch = await loadFixtureBatch();
  const baseUrl = peerBaseUrl(peerServer);

  expect(await peerApiClient.startCvrTransfer(startInput(batch))).toEqual(
    ok({ alreadyComplete: false })
  );
  const half = Math.floor(batch.cvrs.length / 2);
  for (const cvr of batch.cvrs.slice(0, half)) {
    expect((await uploadCvr(baseUrl, batch, cvr)).status).toEqual(200);
  }

  // Finishing early reports how many records are missing
  expect(
    await peerApiClient.finishCvrTransfer({
      machineId: SCANNER_ID,
      batchId: batch.batchId,
    })
  ).toEqual(
    err({
      type: 'sheet-count-mismatch',
      expected: batch.sheetCount,
      received: half,
    })
  );
  expect(workspace.store.getCvrFiles(electionId)).toHaveLength(0);

  // "Restart": start again, re-send everything (overwrites are fine)
  expect(await peerApiClient.startCvrTransfer(startInput(batch))).toEqual(
    ok({ alreadyComplete: false })
  );
  for (const cvr of batch.cvrs) {
    expect((await uploadCvr(baseUrl, batch, cvr)).status).toEqual(200);
  }
  expect(
    await peerApiClient.finishCvrTransfer({
      machineId: SCANNER_ID,
      batchId: batch.batchId,
    })
  ).toEqual(ok({ cvrCount: batch.sheetCount }));
});

test('startCvrTransfer rejects incompatible scanners', async () => {
  const { apiClient, auth, peerApiClient } = buildTestEnvironment();
  const batch = await loadFixtureBatch();

  // Host not configured yet
  expect(await peerApiClient.startCvrTransfer(startInput(batch))).toEqual(
    err({ type: 'host-unconfigured' })
  );

  await configureMachine(apiClient, auth, electionDefinition);

  expect(
    await peerApiClient.startCvrTransfer(
      startInput(batch, { codeVersion: 'some-other-version' })
    )
  ).toEqual(err({ type: 'code-version-mismatch' }));

  expect(
    await peerApiClient.startCvrTransfer(
      startInput(batch, { ballotHash: 'some-other-hash' })
    )
  ).toEqual(err({ type: 'ballot-hash-mismatch' }));

  expect(
    await peerApiClient.startCvrTransfer(
      startInput(batch, { machineId: '../escape' })
    )
  ).toEqual(err({ type: 'scanner-unconfigured' }));
});

test('startCvrTransfer enforces the test/official mode lock', async () => {
  const { apiClient, auth, peerApiClient, peerServer } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  const batch = await loadFixtureBatch();
  const baseUrl = peerBaseUrl(peerServer);

  expect(await peerApiClient.startCvrTransfer(startInput(batch))).toEqual(
    ok({ alreadyComplete: false })
  );
  for (const cvr of batch.cvrs) {
    expect((await uploadCvr(baseUrl, batch, cvr)).status).toEqual(200);
  }
  (
    await peerApiClient.finishCvrTransfer({
      machineId: SCANNER_ID,
      batchId: batch.batchId,
    })
  ).unsafeUnwrap();

  // The election is now locked to test mode; an official transfer is refused
  expect(
    await peerApiClient.startCvrTransfer(
      startInput(batch, { batchId: 'another-batch', isTestMode: false })
    )
  ).toEqual(err({ type: 'invalid-mode', currentMode: 'test' }));
});

test('transfers are refused once results are marked official', async () => {
  const { apiClient, auth, peerApiClient, peerServer, workspace } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  const electionId = assertDefined(workspace.store.getCurrentElectionId());
  const batch = await loadFixtureBatch();
  const baseUrl = peerBaseUrl(peerServer);

  (await peerApiClient.startCvrTransfer(startInput(batch))).unsafeUnwrap();
  for (const cvr of batch.cvrs) {
    expect((await uploadCvr(baseUrl, batch, cvr)).status).toEqual(200);
  }

  // Results are marked official while the transfer is in flight
  mockElectionManagerAuth(auth, electionDefinition.election);
  await apiClient.markResultsOfficial();

  expect(
    await peerApiClient.finishCvrTransfer({
      machineId: SCANNER_ID,
      batchId: batch.batchId,
    })
  ).toEqual(err({ type: 'results-official' }));
  expect(workspace.store.getCvrFiles(electionId)).toHaveLength(0);
  expect(
    await peerApiClient.startCvrTransfer(
      startInput(batch, { batchId: 'another-batch' })
    )
  ).toEqual(err({ type: 'results-official' }));
});

test('finishCvrTransfer honors a mode lock that landed mid-transfer', async () => {
  const { apiClient, auth, peerApiClient, peerServer, workspace } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  const electionId = assertDefined(workspace.store.getCurrentElectionId());
  const batch = await loadFixtureBatch();
  const baseUrl = peerBaseUrl(peerServer);

  (await peerApiClient.startCvrTransfer(startInput(batch))).unsafeUnwrap();
  for (const cvr of batch.cvrs) {
    expect((await uploadCvr(baseUrl, batch, cvr)).status).toEqual(200);
  }

  // An official-mode import lands before the test-mode transfer finishes
  workspace.store.addCastVoteRecordFileRecord({
    id: 'official-import',
    electionId,
    isTestMode: false,
    filename: 'official-export',
    exportedTimestamp: new Date().toISOString(),
    scannerIds: new Set(['CS-02']),
    pollingPlaceIds: new Set(),
    batchIds: [],
    source: { type: 'usb', sha256Hash: 'test-hash' },
  });

  expect(
    await peerApiClient.finishCvrTransfer({
      machineId: SCANNER_ID,
      batchId: batch.batchId,
    })
  ).toEqual(err({ type: 'invalid-mode', currentMode: 'official' }));
  // Nothing from the refused transfer was imported
  expect(workspace.store.getCvrFiles(electionId)).toHaveLength(1);
  expect(
    workspace.store.getNetworkCvrImportId(electionId, SCANNER_ID, batch.batchId)
  ).toBeUndefined();
});

test('upload endpoint rejects invalid requests', async () => {
  const { apiClient, auth, peerApiClient, peerServer } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  const batch = await loadFixtureBatch();
  const baseUrl = peerBaseUrl(peerServer);
  const cvr = assertDefined(batch.cvrs[0]);

  // Upload before the transfer has started
  expect((await uploadCvr(baseUrl, batch, cvr)).status).toEqual(400);

  expect(await peerApiClient.startCvrTransfer(startInput(batch))).toEqual(
    ok({ alreadyComplete: false })
  );

  // Not a zip
  const badBody = await fetch(
    baseUrl + getCvrTransferUploadPath(SCANNER_ID, batch.batchId, cvr.id),
    {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array(Buffer.from('not a zip')),
    }
  );
  expect(badBody.status).toEqual(400);

  // Wrong content type
  const wrongType = await fetch(
    baseUrl + getCvrTransferUploadPath(SCANNER_ID, batch.batchId, cvr.id),
    {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'not a zip',
    }
  );
  expect(wrongType.status).toEqual(400);

  // Too many zip entries
  const bloatedResponse = await fetch(
    baseUrl + getCvrTransferUploadPath(SCANNER_ID, batch.batchId, cvr.id),
    {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array(
        await zipFile(
          Object.fromEntries(
            Array.from({ length: 10 }, (_, i) => [`file-${i}.json`, '{}'])
          )
        )
      ),
    }
  );
  expect(bloatedResponse.status).toEqual(400);

  // Zip entry that decompresses far larger than any real cast vote record
  const bombResponse = await fetch(
    baseUrl + getCvrTransferUploadPath(SCANNER_ID, batch.batchId, cvr.id),
    {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array(
        await zipFile({ 'bomb.json': Buffer.alloc(16 * 1024 * 1024) })
      ),
    }
  );
  expect(bombResponse.status).toEqual(400);
  expect(await bombResponse.json()).toEqual({ error: 'zip entry too large' });

  // A zip whose central directory understates an entry's size; jszip catches
  // the mismatch once the entry is fully decompressed.
  const lyingZip = await zipFile({ 'lying.json': Buffer.alloc(4096) });
  const centralDirectoryOffset = lyingZip.indexOf(
    Buffer.from([0x50, 0x4b, 0x01, 0x02])
  );
  // Uncompressed size is 4 bytes at offset 24 of the central directory entry
  lyingZip.writeUInt32LE(1024, centralDirectoryOffset + 24);
  const lyingResponse = await fetch(
    baseUrl + getCvrTransferUploadPath(SCANNER_ID, batch.batchId, cvr.id),
    {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array(lyingZip),
    }
  );
  expect(lyingResponse.status).toEqual(400);
  expect(await lyingResponse.json()).toEqual({ error: 'invalid zip' });

  // Zip entry with an unsafe (path-traversing) name. Note jszip sanitizes
  // leading `../` on load, so use a nested path to exercise the guard.
  const evilResponse = await fetch(
    baseUrl + getCvrTransferUploadPath(SCANNER_ID, batch.batchId, cvr.id),
    {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array(await zipFile({ 'sub/evil.json': '{}' })),
    }
  );
  expect(evilResponse.status).toEqual(400);
});

test('rejects invalid cast vote records at upload time', async () => {
  const { apiClient, auth, peerApiClient, peerServer } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  const batch = await loadFixtureBatch();
  const baseUrl = peerBaseUrl(peerServer);
  const cvr = assertDefined(batch.cvrs[0]);

  expect(await peerApiClient.startCvrTransfer(startInput(batch))).toEqual(
    ok({ alreadyComplete: false })
  );

  // A corrupted report is rejected immediately, with a reason
  const corruptResponse = await fetch(
    baseUrl + getCvrTransferUploadPath(SCANNER_ID, batch.batchId, cvr.id),
    {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array(
        await zipFile({ 'cast-vote-record-report.json': 'not json' })
      ),
    }
  );
  expect(corruptResponse.status).toEqual(400);
  expect(await corruptResponse.json()).toEqual({
    error: expect.stringContaining('invalid cast vote record'),
  });

  // A valid record uploaded under the wrong id is rejected
  const mismatchResponse = await fetch(
    baseUrl +
      getCvrTransferUploadPath(SCANNER_ID, batch.batchId, 'some-other-id'),
    {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array(cvr.zip),
    }
  );
  expect(mismatchResponse.status).toEqual(400);
  expect(await mismatchResponse.json()).toEqual({
    error: 'cast vote record id mismatch',
  });
});

test('finishCvrTransfer without a started transfer is not found', async () => {
  const { apiClient, auth, peerApiClient } = buildTestEnvironment();
  expect(
    await peerApiClient.finishCvrTransfer({
      machineId: SCANNER_ID,
      batchId: 'no-such-batch',
    })
  ).toEqual(err({ type: 'transfer-not-found' }));

  await configureMachine(apiClient, auth, electionDefinition);
  expect(
    await peerApiClient.finishCvrTransfer({
      machineId: SCANNER_ID,
      batchId: 'no-such-batch',
    })
  ).toEqual(err({ type: 'transfer-not-found' }));
});

test('rejects unsafe ids in the upload path and finish input', async () => {
  const { apiClient, auth, peerApiClient, peerServer, peerLogger } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  const batch = await loadFixtureBatch();
  const baseUrl = peerBaseUrl(peerServer);
  const cvr = assertDefined(batch.cvrs[0]);

  expect(await peerApiClient.startCvrTransfer(startInput(batch))).toEqual(
    ok({ alreadyComplete: false })
  );
  const response = await uploadZip(baseUrl, batch, 'a b', cvr.zip);
  expect(response.status).toEqual(400);
  expect(await response.json()).toEqual({ error: 'invalid id' });
  expect(peerLogger.log).toHaveBeenCalledWith(
    LogEventId.AdminNetworkStatus,
    'system',
    expect.objectContaining({
      disposition: 'failure',
      castVoteRecordId: 'a b',
      error: 'invalid id',
    })
  );

  expect(
    await peerApiClient.finishCvrTransfer({
      machineId: 'a b',
      batchId: batch.batchId,
    })
  ).toEqual(err({ type: 'transfer-not-found' }));
  expect(peerLogger.log).toHaveBeenCalledWith(
    LogEventId.AdminNetworkStatus,
    'system',
    expect.objectContaining({
      disposition: 'failure',
      error: 'transfer-not-found',
    })
  );
});

test('rejects records that fail election validation or image verification', async () => {
  const { apiClient, auth, peerApiClient, peerServer } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  const batch = await loadFixtureBatch();
  const baseUrl = peerBaseUrl(peerServer);
  expect(await peerApiClient.startCvrTransfer(startInput(batch))).toEqual(
    ok({ alreadyComplete: false })
  );

  const cvr = assertDefined(batch.cvrs[0]);
  const badStyle = await rezip(cvr.zip, (files) =>
    editReport(files, (report) => {
      assertDefined(report.CVR[0])['BallotStyleId'] = 'no-such-ballot-style';
    })
  );
  const badStyleResponse = await uploadZip(baseUrl, batch, cvr.id, badStyle);
  expect(badStyleResponse.status).toEqual(400);
  expect(await badStyleResponse.json()).toEqual({
    error: 'invalid cast vote record (ballot-style-not-found)',
  });

  // Ballot images are only read (and so verified against the hashes in the
  // report) for records that need adjudication, so try each record until one
  // trips the check. Records that don't need adjudication are accepted.
  const results = new Set<string>();
  for (const candidate of batch.cvrs) {
    const badImage = await rezip(candidate.zip, (files) =>
      replaceFiles(files, '.jpg', 'not an image')
    );
    const response = await uploadZip(baseUrl, batch, candidate.id, badImage);
    if (response.status === 200) {
      results.add('accepted');
      continue;
    }
    expect(response.status).toEqual(400);
    const { error } = (await response.json()) as { error: string };
    results.add(error);
    if (error === 'could not verify a ballot image') break;
  }
  expect(results).toContain('could not verify a ballot image');
  expect([...results]).toEqual(
    expect.arrayContaining([expect.stringMatching(/accepted|could not verify/)])
  );
});

test('verifies and stages layout files for hand-marked paper ballots', async () => {
  const hmpbElectionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  const { apiClient, auth, peerApiClient, peerServer, workspace } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, hmpbElectionDefinition);
  const batch = await loadFixtureBatch(electionPrimaryPrecinctSplitsFixtures);
  const baseUrl = peerBaseUrl(peerServer);
  expect(
    await peerApiClient.startCvrTransfer(
      startInput(batch, { ballotHash: hmpbElectionDefinition.ballotHash })
    )
  ).toEqual(ok({ alreadyComplete: false }));

  // As with images, layouts are only read for records needing adjudication.
  let verifiedLayout = false;
  for (const candidate of batch.cvrs) {
    const badLayout = await rezip(candidate.zip, (files) =>
      replaceFiles(files, '.layout.json', '{}')
    );
    const response = await uploadZip(baseUrl, batch, candidate.id, badLayout);
    if (response.status === 200) continue;
    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({
      error: 'could not verify a layout file',
    });
    verifiedLayout = true;
    break;
  }
  expect(verifiedLayout).toEqual(true);

  // The pristine records, layouts included, are accepted and imported
  for (const cvr of batch.cvrs) {
    expect((await uploadCvr(baseUrl, batch, cvr)).status).toEqual(200);
  }
  expect(
    await peerApiClient.finishCvrTransfer({
      machineId: SCANNER_ID,
      batchId: batch.batchId,
    })
  ).toEqual(ok({ cvrCount: batch.sheetCount }));
  const electionId = assertDefined(workspace.store.getCurrentElectionId());
  expect(workspace.store.getCvrFiles(electionId)[0]?.numCvrsImported).toEqual(
    batch.sheetCount
  );
});

async function importFixtureExportFromUsb(
  apiClient: Awaited<ReturnType<typeof buildTestEnvironment>>['apiClient'],
  auth: Awaited<ReturnType<typeof buildTestEnvironment>>['auth']
): Promise<void> {
  mockElectionManagerAuth(auth, electionDefinition.election);
  (
    await apiClient.addCastVoteRecordFile({
      path: electionTwoPartyPrimaryFixtures.castVoteRecordExport.asDirectoryPath(),
    })
  ).unsafeUnwrap();
}

test('a network transfer of a batch already imported from USB adds no ballots', async () => {
  const { apiClient, auth, peerApiClient, peerServer, workspace } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  await importFixtureExportFromUsb(apiClient, auth);
  const electionId = assertDefined(workspace.store.getCurrentElectionId());
  const ballotCountBefore = await apiClient.getTotalBallotCount();

  const batch = await loadFixtureBatch();
  const baseUrl = peerBaseUrl(peerServer);
  expect(await peerApiClient.startCvrTransfer(startInput(batch))).toEqual(
    ok({ alreadyComplete: false })
  );
  for (const cvr of batch.cvrs) {
    expect((await uploadCvr(baseUrl, batch, cvr)).status).toEqual(200);
  }
  expect(
    await peerApiClient.finishCvrTransfer({
      machineId: SCANNER_ID,
      batchId: batch.batchId,
    })
  ).toEqual(ok({ cvrCount: batch.sheetCount }));

  expect(workspace.store.getCvrFiles(electionId)).toHaveLength(2);
  expect(await apiClient.getTotalBallotCount()).toEqual(ballotCountBefore);
});

test('finish fails and rolls back when a record conflicts with an imported ballot', async () => {
  const { apiClient, auth, peerApiClient, peerServer, workspace, peerLogger } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  await importFixtureExportFromUsb(apiClient, auth);
  const electionId = assertDefined(workspace.store.getCurrentElectionId());

  const batch = await loadFixtureBatch();
  const baseUrl = peerBaseUrl(peerServer);
  expect(await peerApiClient.startCvrTransfer(startInput(batch))).toEqual(
    ok({ alreadyComplete: false })
  );
  const [conflicting, ...rest] = batch.cvrs;
  assert(conflicting);
  // Same ballot id as the USB import, different votes
  const conflictingZip = await rezip(conflicting.zip, (files) =>
    editReport(files, (report) => {
      for (const snapshot of assertDefined(report.CVR[0])[
        'CVRSnapshot'
      ] as Array<{
        CVRContest: Array<{ CVRContestSelection?: unknown[] }>;
      }>) {
        const contest = snapshot.CVRContest.find(
          (c) => (c.CVRContestSelection ?? []).length > 0
        );
        if (contest) contest.CVRContestSelection = [];
      }
    })
  );
  expect(
    (await uploadZip(baseUrl, batch, conflicting.id, conflictingZip)).status
  ).toEqual(200);
  for (const cvr of rest) {
    expect((await uploadCvr(baseUrl, batch, cvr)).status).toEqual(200);
  }

  expect(
    await peerApiClient.finishCvrTransfer({
      machineId: SCANNER_ID,
      batchId: batch.batchId,
    })
  ).toEqual(
    err({
      type: 'import-failed',
      subType: 'ballot-id-already-exists-with-different-data',
    })
  );
  expect(peerLogger.log).toHaveBeenCalledWith(
    LogEventId.ImportCastVoteRecordsComplete,
    'system',
    expect.objectContaining({
      disposition: 'failure',
      error: 'ballot-id-already-exists-with-different-data',
    })
  );
  // Nothing from the transfer became visible
  expect(workspace.store.getCvrFiles(electionId)).toHaveLength(1);
});
