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
import { anyPollingPlace } from '@votingworks/types';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createWorkspace, Workspace } from './util/workspace.js';
import { makeMockScanner } from '../test/util/mocks.js';
import { BatchScanner } from './fujitsu_scanner.js';
import {
  BatchScannerStateMachine,
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

function expectBatchStartFailure(logger: MockLogger, message: string) {
  return vi.waitFor(() =>
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ScanBatchInit,
      'unknown',
      {
        disposition: 'failure',
        message: `User attempt to start scanning failed: ${message}`,
      }
    )
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
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanBatchInit,
    'unknown',
    expect.objectContaining({ disposition: 'success', batchId: batch.id })
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanBatchComplete,
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
  await expectBatchStartFailure(logger, 'scanner unavailable');
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
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScannerEvent,
    'system',
    expect.objectContaining({
      message: expect.stringMatching(/^Event: error\.platform/),
      eventObject: expect.stringContaining('paper jam'),
    }),
    expect.any(Function)
  );
  expect(logger.log).not.toHaveBeenCalledWith(
    LogEventId.ScanBatchComplete,
    expect.anything(),
    expect.anything()
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
  const { machine, workspace } = await setup(scanner);
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
  const { machine, workspace } = await setup(scanner);
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
});
