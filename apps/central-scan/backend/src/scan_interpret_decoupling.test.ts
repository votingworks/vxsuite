import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  makeTemporaryDirectory,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import { Deferred, deferred } from '@votingworks/basics';
import { mockBaseLogger, mockLogger } from '@votingworks/logging';
import { Importer } from './importer';
import { createWorkspace, Workspace } from './util/workspace';
import {
  DeferredMockScanner,
  makeDeferredMockScanner,
  makeImageFile,
} from '../test/util/mocks';
import { ScannedSheetInfo } from './fujitsu_scanner';

const electionDefinition = readElectionGeneralDefinition();

async function makeSheet(): Promise<ScannedSheetInfo> {
  const [frontPath, backPath] = await Promise.all([
    makeImageFile(),
    makeImageFile(),
  ]);
  return { frontPath, backPath };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpy = ReturnType<typeof vi.spyOn<any, any>>;

function setupTimingTest(options?: {
  maxScanAhead?: number;
  artificialInterpretDelayMs?: number;
}): {
  importer: Importer;
  workspace: Workspace;
  scanner: DeferredMockScanner;
  interpretDeferreds: Array<Deferred<void>>;
  sheetAddedSpy: AnySpy;
} {
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
  const scanner = makeDeferredMockScanner();
  const importer = new Importer({
    workspace,
    scanner,
    logger: mockLogger({ fn: vi.fn }),
    maxScanAhead: options?.maxScanAhead,
    artificialInterpretDelayMs: options?.artificialInterpretDelayMs,
  });
  importer.configure(electionDefinition, 'test-jurisdiction', 'test-hash');

  const interpretDeferreds: Array<Deferred<void>> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sheetAddedSpy = vi.spyOn(importer as any, 'sheetAdded');
  sheetAddedSpy.mockImplementation(async () => {
    const d = deferred<void>();
    interpretDeferreds.push(d);
    await d.promise;
    return 'mock-sheet-id';
  });

  return { importer, workspace, scanner, interpretDeferreds, sheetAddedSpy };
}

describe('scan/interpret decoupling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('maxScanAhead=Infinity: all sheets scanned before interpretations resolve', async () => {
    const { importer, scanner, interpretDeferreds, sheetAddedSpy } =
      setupTimingTest({ maxScanAhead: Infinity });

    const sheet1 = await makeSheet();
    const sheet2 = await makeSheet();
    const sheet3 = await makeSheet();

    // Add sheets and immediately make them available
    const d1 = scanner.addSheet(sheet1);
    const d2 = scanner.addSheet(sheet2);
    const d3 = scanner.addSheet(sheet3);
    d1.resolve();
    d2.resolve();
    d3.resolve();
    scanner.endSession();

    await importer.startImport();

    // Let the scan loop run; all scans should complete quickly
    await vi.waitFor(() => {
      expect(sheetAddedSpy).toHaveBeenCalledTimes(3);
    });

    // All 3 interpretations are in-flight, none resolved
    expect(interpretDeferreds).toHaveLength(3);

    // Resolve all interpretations
    for (const d of interpretDeferreds) {
      d.resolve();
    }

    await importer.waitForEndOfBatchOrScanningPause();

    // Batch should be finished
    expect(importer.getStatus().ongoingBatchId).toBeUndefined();
  });

  test('maxScanAhead=0: sequential scan-then-interpret behavior', async () => {
    const { importer, scanner, interpretDeferreds, sheetAddedSpy } =
      setupTimingTest({ maxScanAhead: 0 });

    const sheet1 = await makeSheet();
    const sheet2 = await makeSheet();

    const d1 = scanner.addSheet(sheet1);
    const d2 = scanner.addSheet(sheet2);
    d1.resolve();
    d2.resolve();
    scanner.endSession();

    await importer.startImport();

    // First sheet scanned and interpretation started
    await vi.waitFor(() => {
      expect(sheetAddedSpy).toHaveBeenCalledTimes(1);
    });

    // Resolve first interpretation
    interpretDeferreds[0]!.resolve();

    // Now second sheet should be scanned and interpretation started
    await vi.waitFor(() => {
      expect(sheetAddedSpy).toHaveBeenCalledTimes(2);
    });

    // Resolve second interpretation
    interpretDeferreds[1]!.resolve();

    await importer.waitForEndOfBatchOrScanningPause();
    expect(importer.getStatus().ongoingBatchId).toBeUndefined();
  });

  test('maxScanAhead=1: bounded parallelism', async () => {
    const { importer, scanner, interpretDeferreds, sheetAddedSpy } =
      setupTimingTest({ maxScanAhead: 1 });

    const sheet1 = await makeSheet();
    const sheet2 = await makeSheet();
    const sheet3 = await makeSheet();

    const d1 = scanner.addSheet(sheet1);
    const d2 = scanner.addSheet(sheet2);
    const d3 = scanner.addSheet(sheet3);
    d1.resolve();
    d2.resolve();
    d3.resolve();
    scanner.endSession();

    await importer.startImport();

    // First 2 sheets scanned, 2 interpretations in-flight
    await vi.waitFor(() => {
      expect(sheetAddedSpy).toHaveBeenCalledTimes(2);
    });

    // Resolve first interpretation -> frees a slot
    interpretDeferreds[0]!.resolve();

    // Now third sheet should be scanned
    await vi.waitFor(() => {
      expect(sheetAddedSpy).toHaveBeenCalledTimes(3);
    });

    // Resolve remaining
    interpretDeferreds[1]!.resolve();
    interpretDeferreds[2]!.resolve();

    await importer.waitForEndOfBatchOrScanningPause();
    expect(importer.getStatus().ongoingBatchId).toBeUndefined();
  });

  test('adjudication pauses scanning', async () => {
    const { importer, workspace, scanner, interpretDeferreds, sheetAddedSpy } =
      setupTimingTest({ maxScanAhead: Infinity });

    const sheet1 = await makeSheet();
    const sheet2 = await makeSheet();

    const d1 = scanner.addSheet(sheet1);
    const d2 = scanner.addSheet(sheet2);
    d1.resolve();
    d2.resolve();
    scanner.endSession();

    await importer.startImport();

    // Both sheets scanned
    await vi.waitFor(() => {
      expect(sheetAddedSpy).toHaveBeenCalledTimes(2);
    });

    // Mock the first interpretation to trigger adjudication
    const adjudicationSpy = vi
      .spyOn(workspace.store, 'adjudicationStatus')
      .mockReturnValue({ remaining: 1, adjudicated: 0 });

    // Resolve first interpretation
    interpretDeferreds[0]!.resolve();
    // Resolve second interpretation
    interpretDeferreds[1]!.resolve();

    await importer.waitForEndOfBatchOrScanningPause();

    // Batch should still be ongoing (paused for adjudication)
    expect(importer.getStatus().ongoingBatchId).toBeDefined();

    // Simulate adjudication resolved
    adjudicationSpy.mockReturnValue({ remaining: 0, adjudicated: 1 });
    vi.spyOn(workspace.store, 'getNextAdjudicationSheet').mockReturnValue(
      undefined
    );

    // Continue import
    importer.continueImport({ forceAccept: true });

    await importer.waitForEndOfBatchOrScanningPause();

    // Batch should now be finished
    expect(importer.getStatus().ongoingBatchId).toBeUndefined();
  });

  test('interpretation error finishes batch with error', async () => {
    const { importer, workspace, scanner, sheetAddedSpy } = setupTimingTest({
      maxScanAhead: Infinity,
    });

    const sheet1 = await makeSheet();
    const sheet2 = await makeSheet();

    const d1 = scanner.addSheet(sheet1);
    const d2 = scanner.addSheet(sheet2);
    d1.resolve();
    d2.resolve();
    scanner.endSession();

    // Override the mock to reject on the first call
    sheetAddedSpy.mockRejectedValueOnce(new Error('interpret failed'));

    await importer.startImport();
    await importer.waitForEndOfBatchOrScanningPause();

    // Batch should be finished with an error
    const batches = workspace.store.getBatches();
    expect(batches).toHaveLength(1);
    expect(batches[0]!.error).toContain('interpret failed');
    expect(importer.getStatus().ongoingBatchId).toBeUndefined();
  });

  test('waitForEndOfBatchOrScanningPause waits for in-flight interpretations', async () => {
    const { importer, scanner, interpretDeferreds, sheetAddedSpy } =
      setupTimingTest({ maxScanAhead: Infinity });

    const sheet1 = await makeSheet();

    const d1 = scanner.addSheet(sheet1);
    d1.resolve();
    scanner.endSession();

    await importer.startImport();

    await vi.waitFor(() => {
      expect(sheetAddedSpy).toHaveBeenCalledTimes(1);
    });

    // Scan loop has ended (no more sheets), but interpretation still in-flight
    let waitResolved = false;
    const waitPromise = importer.waitForEndOfBatchOrScanningPause().then(() => {
      waitResolved = true;
    });

    // Give a tick for the wait to potentially resolve prematurely
    await Promise.resolve();
    await Promise.resolve();
    expect(waitResolved).toEqual(false);

    // Resolve interpretation
    interpretDeferreds[0]!.resolve();

    await waitPromise;
    expect(waitResolved).toEqual(true);
    expect(importer.getStatus().ongoingBatchId).toBeUndefined();
  });

  test('slow scan with fast interpret works correctly', async () => {
    const { importer, scanner, interpretDeferreds, sheetAddedSpy } =
      setupTimingTest({ maxScanAhead: 1 });

    const sheet1 = await makeSheet();
    const sheet2 = await makeSheet();

    // Add sheets but don't resolve them yet (simulating slow scanner)
    const d1 = scanner.addSheet(sheet1);
    const d2 = scanner.addSheet(sheet2);
    scanner.endSession();

    await importer.startImport();

    // Nothing scanned yet (scanner is slow)
    expect(sheetAddedSpy).not.toHaveBeenCalled();

    // First sheet becomes available
    d1.resolve();

    await vi.waitFor(() => {
      expect(sheetAddedSpy).toHaveBeenCalledTimes(1);
    });

    // Resolve interpretation immediately
    interpretDeferreds[0]!.resolve();

    // Second sheet becomes available
    d2.resolve();

    await vi.waitFor(() => {
      expect(sheetAddedSpy).toHaveBeenCalledTimes(2);
    });

    interpretDeferreds[1]!.resolve();

    await importer.waitForEndOfBatchOrScanningPause();
    expect(importer.getStatus().ongoingBatchId).toBeUndefined();
  });

  test('artificial interpret delay adds delay before interpretation', async () => {
    const workspace = createWorkspace(
      makeTemporaryDirectory(),
      mockBaseLogger({ fn: vi.fn })
    );
    const scanner = makeDeferredMockScanner();
    const importer = new Importer({
      workspace,
      scanner,
      logger: mockLogger({ fn: vi.fn }),
      artificialInterpretDelayMs: 100,
    });
    importer.configure(electionDefinition, 'test-jurisdiction', 'test-hash');

    let sheetAddedCalledAt: number | undefined;
    vi.spyOn(
      importer as unknown as { sheetAdded: Importer['importSheet'] },
      'sheetAdded'
    ).mockImplementation(() => {
      sheetAddedCalledAt = Date.now();
      return Promise.resolve('mock-sheet-id');
    });

    const sheet1 = await makeSheet();
    const d1 = scanner.addSheet(sheet1);
    d1.resolve();
    scanner.endSession();

    const startTime = Date.now();
    await importer.startImport();
    await importer.waitForEndOfBatchOrScanningPause();

    expect(sheetAddedCalledAt).toBeDefined();
    // The artificial delay should have added at least ~100ms
    expect(sheetAddedCalledAt! - startTime).toBeGreaterThanOrEqual(90);
  });

  test('resume after adjudication with in-flight interpretations from before pause', async () => {
    const { importer, workspace, scanner, interpretDeferreds, sheetAddedSpy } =
      setupTimingTest({ maxScanAhead: 2 });

    const sheet1 = await makeSheet();
    const sheet2 = await makeSheet();
    const sheet3 = await makeSheet();
    const sheet4 = await makeSheet();

    const d1 = scanner.addSheet(sheet1);
    const d2 = scanner.addSheet(sheet2);
    const d3 = scanner.addSheet(sheet3);
    const d4 = scanner.addSheet(sheet4);
    d1.resolve();
    d2.resolve();
    d3.resolve();
    d4.resolve();
    scanner.endSession();

    await importer.startImport();

    // All 3 slots should fill up (maxScanAhead=2)
    await vi.waitFor(() => {
      expect(sheetAddedSpy).toHaveBeenCalledTimes(3);
    });

    // Simulate: sheet 1's interpretation completes, triggers adjudication
    const adjudicationSpy = vi.spyOn(workspace.store, 'adjudicationStatus');
    adjudicationSpy.mockReturnValue({ remaining: 1, adjudicated: 0 });

    interpretDeferreds[0]!.resolve();

    // Sheet 2 and 3 are still in-flight. Wait for the loop to pause.
    // Resolve sheets 2 and 3 too so waitForEndOfBatchOrScanningPause returns.
    interpretDeferreds[1]!.resolve();
    interpretDeferreds[2]!.resolve();

    await importer.waitForEndOfBatchOrScanningPause();

    // Batch paused for adjudication, sheet 4 not yet scanned
    expect(importer.getStatus().ongoingBatchId).toBeDefined();
    expect(sheetAddedSpy).toHaveBeenCalledTimes(3);

    // Adjudicate and resume
    adjudicationSpy.mockReturnValue({ remaining: 0, adjudicated: 1 });
    vi.spyOn(workspace.store, 'getNextAdjudicationSheet').mockReturnValue(
      undefined
    );

    importer.continueImport({ forceAccept: true });

    // Sheet 4 should now be scanned
    await vi.waitFor(() => {
      expect(sheetAddedSpy).toHaveBeenCalledTimes(4);
    });

    // Resolve sheet 4's interpretation
    interpretDeferreds[3]!.resolve();

    await importer.waitForEndOfBatchOrScanningPause();
    expect(importer.getStatus().ongoingBatchId).toBeUndefined();
  });
});
