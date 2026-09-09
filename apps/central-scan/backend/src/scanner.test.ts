import { expect, onTestFinished, test, vi } from 'vitest';
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
import { makeMockScanner } from '../test/util/mocks.js';
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
  status: BatchScannerMachineStatus
): Promise<void> {
  await vi.waitFor(() => expect(machine.status()).toEqual(status), {
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
  if (scanner.isAttached()) {
    await waitForStatus(machine, { state: 'idle' });
  }
  return { machine, workspace, logger };
}

function configureElection(workspace: Workspace): void {
  workspace.store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction: 'test-jurisdiction',
    electionPackageHash: 'test-hash',
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

test('an empty batch is finished and cleaned up', async () => {
  const scanner = makeMockScanner();
  const { machine, workspace, logger } = await setup(scanner);
  configureElection(workspace);

  scanner.withNextScannerSession().end();
  machine.startBatch();
  expect(machine.status()).toEqual({
    state: 'scanning',
    batchId: expect.any(String),
  });
  expect(workspace.store.getBatches()).toHaveLength(1);
  await waitForStatus(machine, { state: 'idle' });

  const [batch] = workspace.store.getBatches();
  expect(batch).toEqual(
    expect.objectContaining({ count: 0, endedAt: expect.any(String) })
  );
  expect(
    existsSync(join(workspace.ballotImagesPath, `batch-${batch.id}`))
  ).toEqual(false);
  expect(logger.log).toHaveBeenCalledWith(LogEventId.ScannerEvent, 'unknown', {
    message: 'Event: START_BATCH',
    eventObject: '{"type":"START_BATCH"}',
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

test('a batch whose scanner session fails to open is cleaned up', async () => {
  const scanner = makeMockScanner();
  const { machine, workspace, logger } = await setup(scanner);
  configureElection(workspace);

  vi.spyOn(scanner, 'scanSheets').mockImplementation(() => {
    throw new Error('scanner unavailable');
  });
  machine.startBatch();
  await waitForStatus(machine, { state: 'idle', error: 'scanner unavailable' });
  expect(workspace.store.getBatches()).toHaveLength(0);
  expectErrorEventLogged(logger, 'scanner unavailable');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScannerBatchStarted,
    'unknown',
    {
      disposition: 'failure',
      message: 'User attempt to start scanning failed: scanner unavailable',
      batchId: expect.any(String),
    }
  );
  expect(logger.log).not.toHaveBeenCalledWith(
    LogEventId.ScannerBatchStarted,
    'unknown',
    expect.objectContaining({ disposition: 'success' })
  );
});

test('a scanner error finishes the batch with the error', async () => {
  const scanner = makeMockScanner();
  const { machine, workspace, logger } = await setup(scanner);
  configureElection(workspace);

  scanner.withNextScannerSession().error(new Error('paper jam')).end();
  const finishBatchSpy = vi.spyOn(workspace.store, 'finishBatch');
  machine.startBatch();
  await waitForStatus(machine, { state: 'idle', error: 'paper jam' });

  const [batch] = workspace.store.getBatches();
  expect(batch).toEqual(
    expect.objectContaining({ count: 0, endedAt: expect.any(String) })
  );
  expect(finishBatchSpy).toHaveBeenCalledWith({
    batchId: batch.id,
    error: 'paper jam',
  });
  expectErrorEventLogged(logger, 'paper jam');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScannerBatchEnded,
    'unknown',
    {
      disposition: 'failure',
      message: 'Processing sheet failed: paper jam',
      batchId: batch.id,
    }
  );

  scanner.withNextScannerSession().end();
  machine.startBatch();
  expect(machine.status()).toEqual({
    state: 'scanning',
    batchId: expect.any(String),
  });
  await waitForStatus(machine, { state: 'idle' });
  expect(finishBatchSpy).toHaveBeenLastCalledWith({
    batchId: expect.any(String),
    error: undefined,
  });
});

test('a sheet that fails to import finishes the batch with the error', async () => {
  const scanner = makeMockScanner();
  const { machine, workspace, logger } = await setup(scanner);
  configureElection(workspace);

  scanner
    .withNextScannerSession()
    .sheet({ frontPath: '/not/a/front.png', backPath: '/not/a/back.png' })
    .end();
  const finishBatchSpy = vi.spyOn(workspace.store, 'finishBatch');
  machine.startBatch();
  await vi.waitFor(() =>
    expect(machine.status()).toEqual({
      state: 'idle',
      error: expect.any(String),
    })
  );

  const [batch] = workspace.store.getBatches();
  expect(batch).toEqual(
    expect.objectContaining({ count: 0, endedAt: expect.any(String) })
  );
  expect(finishBatchSpy).toHaveBeenCalledWith({
    batchId: batch.id,
    error: expect.any(String),
  });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScannerBatchEnded,
    'unknown',
    expect.objectContaining({ disposition: 'failure', batchId: batch.id })
  );
});

test('a failure while finishing the batch is reported', async () => {
  const scanner = makeMockScanner();
  const { machine, workspace } = await setup(scanner);
  configureElection(workspace);
  vi.spyOn(workspace.store, 'finishBatch').mockImplementation(() => {
    throw new Error('database locked');
  });

  scanner.withNextScannerSession().end();
  machine.startBatch();
  await waitForStatus(machine, { state: 'idle', error: 'database locked' });
});

test('is disconnected while the scanner is detached and no batch is in progress', async () => {
  const scanner = makeMockScanner();
  const isAttached = vi.spyOn(scanner, 'isAttached').mockReturnValue(false);
  const { machine, workspace, logger } = await setup(scanner);
  configureElection(workspace);

  expect(machine.status()).toEqual({ state: 'disconnected' });
  machine.startBatch();
  expect(machine.status()).toEqual({ state: 'disconnected' });
  expect(workspace.store.getBatches()).toEqual([]);

  isAttached.mockReturnValue(true);
  await waitForStatus(machine, { state: 'idle' });
  scanner.withNextScannerSession().end();
  machine.startBatch();
  await waitForStatus(machine, { state: 'idle' });
  expect(workspace.store.getBatches()).toHaveLength(1);

  isAttached.mockReturnValue(false);
  await waitForStatus(machine, { state: 'disconnected' });

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScannerStateChanged,
    'system',
    expect.objectContaining({ message: 'Transitioned to: "disconnected"' }),
    expect.any(Function)
  );
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
