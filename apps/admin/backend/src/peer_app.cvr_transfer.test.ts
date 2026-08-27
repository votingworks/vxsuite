import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs/promises';
import { AddressInfo } from 'node:net';
import path from 'node:path';
import JsZip from 'jszip';
import { assertDefined, err, ok } from '@votingworks/basics';
import { authenticateArtifactUsingSignatureFile } from '@votingworks/auth';
import { readCastVoteRecordExportMetadata } from '@votingworks/backend';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { getCvrTransferUploadPath } from '@votingworks/networking';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { buildTestEnvironment, configureMachine } from '../test/app.js';

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
  vi.mocked(authenticateArtifactUsingSignatureFile).mockResolvedValue(ok());
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
async function loadFixtureBatch(): Promise<FixtureBatch> {
  const exportDirectoryPath =
    electionTwoPartyPrimaryFixtures.castVoteRecordExport.asDirectoryPath();
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

    const zip = new JsZip();
    for (const fileName of await fs.readdir(castVoteRecordDirectoryPath)) {
      zip.file(
        fileName,
        await fs.readFile(path.join(castVoteRecordDirectoryPath, fileName))
      );
    }
    cvrs.push({
      id: entry.name,
      zip: await zip.generateAsync({ type: 'nodebuffer' }),
    });
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

  // Zip entry with an unsafe (path-traversing) name. Note jszip sanitizes
  // leading `../` on load, so use a nested path to exercise the guard.
  const evilZip = new JsZip();
  evilZip.file('sub/evil.json', '{}');
  const evilResponse = await fetch(
    baseUrl + getCvrTransferUploadPath(SCANNER_ID, batch.batchId, cvr.id),
    {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array(await evilZip.generateAsync({ type: 'nodebuffer' })),
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
  const corruptZip = new JsZip();
  corruptZip.file('cast-vote-record-report.json', 'not json');
  const corruptResponse = await fetch(
    baseUrl + getCvrTransferUploadPath(SCANNER_ID, batch.batchId, cvr.id),
    {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array(
        await corruptZip.generateAsync({ type: 'nodebuffer' })
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
