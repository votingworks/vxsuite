import { expect, Mock, onTestFinished, test, vi } from 'vitest';
import { assertDefined, deferred } from '@votingworks/basics';
import {
  makeTemporaryDirectory,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import {
  LogEventId,
  mockBaseLogger,
  mockLogger,
  MockLogger,
} from '@votingworks/logging';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  anyPollingPlace,
} from '@votingworks/types';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createWorkspace, Workspace } from './util/workspace.js';
import { makeMockScanner, MockScanner } from '../test/util/mocks.js';
import { BatchScanner } from './fujitsu_scanner.js';
import {
  BatchScannerStateMachine,
  cleanLogData,
  createBatchScannerStateMachine,
} from './scanner.js';
import { BatchScannerMachineStatus } from './types.js';

const electionDefinition = readElectionGeneralDefinition();
const { election } = electionDefinition;

async function waitForStatus(
  machine: BatchScannerStateMachine,
  status: Partial<BatchScannerMachineStatus>
): Promise<void> {
  await vi.waitFor(() => expect(machine.status()).toMatchObject(status), {
    timeout: 2_000,
  });
}

async function setup(scanner: BatchScanner = makeMockScanner()): Promise<{
  machine: BatchScannerStateMachine;
  workspace: Workspace;
  logger: MockLogger;
}> {
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
  const logger = mockLogger({ fn: vi.fn });
  const machine = createBatchScannerStateMachine({
    workspace,
    scanner,
    logger,
  });
  onTestFinished(() => machine.stop());
  await waitForStatus(machine, { state: 'idle' });
  return { machine, workspace, logger };
}

function configureElection(workspace: Workspace): void {
  workspace.store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction: 'test-jurisdiction',
    electionPackageHash: 'test-hash',
    ballotHash: electionDefinition.ballotHash,
  });
  workspace.store.setPollingPlaceId(anyPollingPlace(election).id);
}

function expectErrorEventLogged(logger: MockLogger, message: string): void {
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScannerEvent,
    'system',
    expect.objectContaining({
      message: expect.stringMatching(/^Event: error\.platform/),
      eventObject: expect.stringContaining(message),
    }),
    expect.any(Function)
  );
}

function batchImageDirectory(workspace: Workspace, batchId: string): string {
  return join(workspace.ballotImagesPath, `batch-${batchId}`);
}

function settlesBeforeNextMacrotask(
  promise: Promise<unknown>
): Promise<boolean> {
  return Promise.race([
    promise.then(() => true),
    new Promise<boolean>((resolve) => {
      setImmediate(() => resolve(false));
    }),
  ]);
}

function failNextEndBatchOnce(
  scanner: MockScanner,
  error: Error
): Mock<() => Promise<void>> {
  const endBatch = vi
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(error)
    .mockResolvedValue(undefined);
  const scanSheets = scanner.scanSheets.bind(scanner);
  vi.spyOn(scanner, 'scanSheets').mockImplementationOnce((options) => ({
    ...scanSheets(options),
    endBatch,
  }));
  return endBatch;
}

test('save batch after pause from empty input tray', async () => {
  const scanner = makeMockScanner();
  const { machine, workspace, logger } = await setup(scanner);
  configureElection(workspace);

  scanner.withNextScannerSession().end();
  await machine.startBatch();
  const [batch] = workspace.store.getBatches();
  expect(batch).toEqual(
    expect.objectContaining({ count: 0, endedAt: undefined })
  );
  await waitForStatus(machine, {
    state: 'paused',
    batchId: batch.id,
    pauseReason: { type: 'tray-empty' },
  });
  expect(existsSync(batchImageDirectory(workspace, batch.id))).toEqual(true);

  await machine.saveBatch();
  expect(machine.status()).toEqual({ state: 'idle' });
  expect(workspace.store.getBatches()[0]).toEqual(
    expect.objectContaining({ count: 0, endedAt: expect.any(String) })
  );
  expect(existsSync(batchImageDirectory(workspace, batch.id))).toEqual(false);

  expect(logger.log).toHaveBeenCalledWith(LogEventId.ScannerEvent, 'unknown', {
    message: 'Event: START_BATCH',
    eventObject: '{"type":"START_BATCH"}',
  });
  expect(logger.log).toHaveBeenCalledWith(LogEventId.ScannerEvent, 'unknown', {
    message: 'Event: SAVE_BATCH',
    eventObject: '{"type":"SAVE_BATCH"}',
  });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScannerStateChanged,
    'system',
    expect.objectContaining({
      changedFields: expect.stringContaining(`"batchId":"${batch.id}"`),
    }),
    expect.any(Function)
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScannerBatchStarted,
    'unknown',
    expect.objectContaining({ disposition: 'success', batchId: batch.id })
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScannerBatchEnded,
    'unknown',
    expect.objectContaining({
      disposition: 'success',
      batchId: batch.id,
      sheetCount: 0,
    })
  );
});

test('resuming a paused batch restarts the scanner session', async () => {
  const scanner = makeMockScanner();
  const { machine, workspace, logger } = await setup(scanner);
  configureElection(workspace);

  scanner.withNextScannerSession().end();
  await machine.startBatch();
  await waitForStatus(machine, {
    state: 'paused',
    pauseReason: { type: 'tray-empty' },
  });

  const imprinterCheck = deferred<boolean>();
  vi.spyOn(scanner, 'isImprinterAttached').mockReturnValueOnce(
    imprinterCheck.promise
  );
  const sheetHeldInScanner = deferred<void>();
  scanner.withNextScannerSession().waitFor(sheetHeldInScanner.promise).end();

  const resuming = machine.resumeBatch();
  expect(machine.status()).toMatchObject({ state: 'paused' });
  expect(await settlesBeforeNextMacrotask(resuming)).toEqual(false);
  imprinterCheck.resolve(false);
  await resuming;
  expect(machine.status()).toMatchObject({ state: 'scanning' });
  expect(logger.log).toHaveBeenCalledWith(LogEventId.ScannerEvent, 'unknown', {
    message: 'Event: RESUME_BATCH',
    eventObject: '{"type":"RESUME_BATCH"}',
  });
});

test('imprint prefix is unique across pauses within a batch', async () => {
  const scanner = makeMockScanner();
  const { machine, workspace } = await setup(scanner);
  configureElection(workspace);
  vi.spyOn(scanner, 'isImprinterAttached').mockResolvedValue(true);
  const scanSheets = vi.spyOn(scanner, 'scanSheets');

  scanner.withNextScannerSession().end();
  await machine.startBatch();
  const [batch] = workspace.store.getBatches();
  await waitForStatus(machine, {
    state: 'paused',
    pauseReason: { type: 'tray-empty' },
  });

  scanner.withNextScannerSession().end();
  await machine.resumeBatch();
  await waitForStatus(machine, {
    state: 'paused',
    pauseReason: { type: 'tray-empty' },
  });

  scanner.withNextScannerSession().end();
  await machine.resumeBatch();
  await waitForStatus(machine, {
    state: 'paused',
    pauseReason: { type: 'tray-empty' },
  });

  await machine.saveBatch();
  scanner.withNextScannerSession().end();
  await machine.startBatch();
  const newBatch = assertDefined(
    workspace.store.getBatches().find((b) => b.id !== batch.id)
  );
  await waitForStatus(machine, {
    state: 'paused',
    pauseReason: { type: 'tray-empty' },
  });

  expect(
    scanSheets.mock.calls.map(([options]) => options?.imprintIdPrefix)
  ).toEqual([
    `${batch.id}_0`,
    `${batch.id}_1`,
    `${batch.id}_2`,
    `${newBatch.id}_0`,
  ]);
});

test('discarding a paused batch deletes it', async () => {
  const scanner = makeMockScanner();
  const { machine, workspace, logger } = await setup(scanner);
  configureElection(workspace);

  scanner.withNextScannerSession().end();
  await machine.startBatch();
  const [batch] = workspace.store.getBatches();
  await waitForStatus(machine, { state: 'paused' });

  await machine.discardBatch();
  expect(machine.status()).toEqual({ state: 'idle' });
  expect(workspace.store.getBatches()).toEqual([]);
  expect(existsSync(batchImageDirectory(workspace, batch.id))).toEqual(false);
  expect(logger.log).toHaveBeenCalledWith(LogEventId.ScannerEvent, 'unknown', {
    message: 'Event: DISCARD_BATCH',
    eventObject: '{"type":"DISCARD_BATCH"}',
  });
  expect(logger.log).not.toHaveBeenCalledWith(
    LogEventId.ScannerBatchEnded,
    expect.any(String),
    expect.anything()
  );
});

test('error when starting a batch', async () => {
  const scanner = makeMockScanner();
  const { machine, workspace, logger } = await setup(scanner);
  configureElection(workspace);

  vi.spyOn(scanner, 'scanSheets').mockImplementation(() => {
    throw new Error('scanner unavailable');
  });
  await machine.startBatch();
  expect(workspace.store.getBatches()).toHaveLength(1);
  const [batch] = workspace.store.getBatches();
  expect(machine.status()).toEqual({ state: 'error', batchId: batch.id });
  expectErrorEventLogged(logger, 'scanner unavailable');
  expect(logger.log).not.toHaveBeenCalledWith(
    LogEventId.ScannerBatchStarted,
    'unknown',
    expect.objectContaining({ disposition: 'success' })
  );

  await machine.discardBatch();
  expect(machine.status()).toEqual({ state: 'idle' });
  expect(workspace.store.getBatches()).toEqual([]);
});

test('error in scanning', async () => {
  const scanner = makeMockScanner();
  const { machine, workspace, logger } = await setup(scanner);
  configureElection(workspace);

  scanner.withNextScannerSession().error(new Error('paper jam')).end();
  const finishBatchSpy = vi.spyOn(workspace.store, 'finishBatch');
  await machine.startBatch();
  await waitForStatus(machine, { state: 'error' });

  const [batch] = workspace.store.getBatches();
  expect(batch).toEqual(
    expect.objectContaining({ count: 0, endedAt: undefined })
  );
  expect(finishBatchSpy).not.toHaveBeenCalled();
  expectErrorEventLogged(logger, 'paper jam');

  await machine.discardBatch();
  expect(machine.status()).toEqual({ state: 'idle' });
  expect(workspace.store.getBatches()).toEqual([]);
  expect(existsSync(batchImageDirectory(workspace, batch.id))).toEqual(false);

  scanner.withNextScannerSession().end();
  await machine.startBatch();
  await waitForStatus(machine, {
    state: 'paused',
    pauseReason: { type: 'tray-empty' },
  });
  await machine.saveBatch();
  expect(machine.status()).toEqual({ state: 'idle' });
  expect(finishBatchSpy).toHaveBeenCalledWith(expect.any(String));
});

test('error in interpreting', async () => {
  const scanner = makeMockScanner();
  const { machine, workspace, logger } = await setup(scanner);
  configureElection(workspace);

  scanner
    .withNextScannerSession()
    .sheet({ frontPath: '/not/a/front.png', backPath: '/not/a/back.png' })
    .end();
  await machine.startBatch();
  await waitForStatus(machine, { state: 'error' });

  const [batch] = workspace.store.getBatches();
  expect(batch).toEqual(
    expect.objectContaining({ count: 0, endedAt: undefined })
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScannerEvent,
    'system',
    expect.objectContaining({
      message: expect.stringMatching(/^Event: error\.platform/),
    }),
    expect.any(Function)
  );

  await machine.discardBatch();
  expect(machine.status()).toEqual({ state: 'idle' });
});

test('error in saving', async () => {
  const scanner = makeMockScanner();
  const { machine, workspace, logger } = await setup(scanner);
  configureElection(workspace);
  vi.spyOn(workspace.store, 'finishBatch').mockImplementation(() => {
    throw new Error('database locked');
  });

  scanner.withNextScannerSession().end();
  await machine.startBatch();
  await waitForStatus(machine, {
    state: 'paused',
    pauseReason: { type: 'tray-empty' },
  });

  const [batch] = workspace.store.getBatches();
  await machine.saveBatch();
  expect(machine.status()).toEqual({ state: 'error', batchId: batch.id });
  expect(workspace.store.getBatches()[0]).toEqual(
    expect.objectContaining({ count: 0, endedAt: undefined })
  );
  expectErrorEventLogged(logger, 'database locked');

  await machine.discardBatch();
  expect(machine.status()).toEqual({ state: 'idle' });
  expect(workspace.store.getBatches()).toEqual([]);
});

test('cleanLogData keeps only adjudication reason types and hides large values', () => {
  const overvote: AdjudicationReasonInfo = {
    type: AdjudicationReason.Overvote,
    contestId: 'contest-1',
    optionIds: ['option-1', 'option-2'],
    expected: 1,
  };
  const cleaned = JSON.parse(
    JSON.stringify(
      {
        data: { type: 'NeedsReviewSheet', reasons: [overvote] },
        batchContext: { control: { scanSheet: 'fn' }, imageDirectory: '/tmp' },
        error: new Error('paper jam'),
        scannedSheet: undefined,
      },
      cleanLogData
    )
  );
  expect(cleaned).toEqual({
    data: { type: 'NeedsReviewSheet', reasons: ['Overvote'] },
    batchContext: { control: '[hidden]', imageDirectory: '/tmp' },
    error: { message: 'paper jam', stack: expect.any(String) },
    scannedSheet: 'undefined',
  });
});

test('error: discard failure and success paths', async () => {
  const scanner = makeMockScanner();
  const { machine, workspace, logger } = await setup(scanner);
  configureElection(workspace);

  const endBatch = failNextEndBatchOnce(
    scanner,
    new Error('scanner unresponsive')
  );
  scanner.withNextScannerSession().error(new Error('paper jam')).end();
  await machine.startBatch();
  await waitForStatus(machine, { state: 'error' });
  const [batch] = workspace.store.getBatches();

  await machine.discardBatch();
  expect(machine.status()).toEqual({ state: 'error', batchId: batch.id });
  expect(endBatch).toHaveBeenCalledTimes(1);
  expect(workspace.store.getBatches()).toHaveLength(1);
  expectErrorEventLogged(logger, 'scanner unresponsive');

  await machine.discardBatch();
  expect(machine.status()).toEqual({ state: 'idle' });
  expect(endBatch).toHaveBeenCalledTimes(2);
  expect(workspace.store.getBatches()).toEqual([]);
});

test('paused: discard failure and success paths', async () => {
  const scanner = makeMockScanner();
  const { machine, workspace, logger } = await setup(scanner);
  configureElection(workspace);

  const endBatch = failNextEndBatchOnce(
    scanner,
    new Error('scanner unresponsive')
  );
  scanner.withNextScannerSession().end();
  await machine.startBatch();
  const [batch] = workspace.store.getBatches();
  await waitForStatus(machine, {
    state: 'paused',
    pauseReason: { type: 'tray-empty' },
  });

  await machine.discardBatch();
  expect(machine.status()).toEqual({ state: 'error', batchId: batch.id });
  expect(endBatch).toHaveBeenCalledTimes(1);
  expect(workspace.store.getBatches()).toHaveLength(1);
  expectErrorEventLogged(logger, 'scanner unresponsive');

  await machine.discardBatch();
  expect(machine.status()).toEqual({ state: 'idle' });
  expect(endBatch).toHaveBeenCalledTimes(2);
  expect(workspace.store.getBatches()).toEqual([]);
  expect(existsSync(batchImageDirectory(workspace, batch.id))).toEqual(false);
});

test('resume: error in starting new scan session', async () => {
  const scanner = makeMockScanner();
  const { machine, workspace, logger } = await setup(scanner);
  configureElection(workspace);

  scanner.withNextScannerSession().end();
  await machine.startBatch();
  const [batch] = workspace.store.getBatches();
  await waitForStatus(machine, {
    state: 'paused',
    pauseReason: { type: 'tray-empty' },
  });

  vi.spyOn(scanner, 'scanSheets').mockImplementationOnce(() => {
    throw new Error('scanner unavailable');
  });
  await machine.resumeBatch();
  expect(machine.status()).toEqual({ state: 'error', batchId: batch.id });
  expect(workspace.store.getBatches()[0]).toEqual(
    expect.objectContaining({ count: 0, endedAt: undefined })
  );
  expectErrorEventLogged(logger, 'scanner unavailable');

  await machine.discardBatch();
  expect(machine.status()).toEqual({ state: 'idle' });
  expect(workspace.store.getBatches()).toEqual([]);
  expect(existsSync(batchImageDirectory(workspace, batch.id))).toEqual(false);
});

test('tray empty pause reason takes precedence over manual pausing', async () => {
  const scanner = makeMockScanner();
  const { machine, workspace } = await setup(scanner);
  configureElection(workspace);

  const trayChecked = deferred<void>();
  const scannerWaiting = deferred<void>();
  scanner
    .withNextScannerSession()
    .waitFor(trayChecked.promise, () => scannerWaiting.resolve())
    .end();
  await machine.startBatch();
  await scannerWaiting.promise;

  const pausing = machine.pauseBatch();
  expect(machine.status()).toMatchObject({ state: 'scanning' });
  trayChecked.resolve();
  await pausing;
  expect(machine.status()).toMatchObject({
    state: 'paused',
    pauseReason: { type: 'tray-empty' },
  });
});
