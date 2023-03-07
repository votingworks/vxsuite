import { err, ok, sleep } from '@votingworks/basics';
import { ErrorCode, mocks } from '@votingworks/custom-scanner';
import { Logger } from '@votingworks/logging';
import { AdjudicationReason } from '@votingworks/types';
import {
  configureApp,
  expectStatus,
  waitForStatus,
} from '../../../test/helpers/app_helpers';
import {
  ballotImages as customBallotImages,
  createCustomScannerApp,
  createSimpleCustomScannerApp,
} from '../../../test/helpers/scanners/custom/app_helpers';
import { PrecinctScannerInterpreter } from '../../interpret';
import { SheetInterpretation } from '../../types';
import { MAX_FAILED_SCAN_ATTEMPTS } from './state_machine';

jest.setTimeout(20_000);
jest.mock('@votingworks/ballot-encoder', () => {
  return {
    ...jest.requireActual('@votingworks/ballot-encoder'),
    // to allow changing election definitions without changing the image fixtures
    // TODO: generate image fixtures from election definitions more easily
    // this election hash is for the famous names image fixtures
    sliceElectionHash: () => 'da81438d51136692b43c',
  };
});

// Basic checks for logging. We don't try to be exhaustive here because paper
// status polling can be a bit non-deterministic, so logs can vary between runs.
export function checkLogs(logger: Logger): void {
  // Make sure we got a transition
  expect(logger.log).toHaveBeenCalledWith(
    'scanner-state-machine-transition',
    'system',
    { message: 'Transitioned to: "checking_initial_paper_status"' },
    expect.any(Function)
  );
  // Make sure we got an event
  expect(logger.log).toHaveBeenCalledWith(
    'scanner-state-machine-event',
    'system',
    { message: 'Event: SCANNER_NO_PAPER' },
    expect.any(Function)
  );
  // Make sure we got a context update. And make sure we didn't log the votes in
  // the interpretation, just the type, to protect voter privacy.
  expect(logger.log).toHaveBeenCalledWith(
    'scanner-state-machine-transition',
    'system',
    {
      message: 'Context updated',
      changedFields: expect.stringMatching(
        /{"interpretation":"(ValidSheet|InvalidSheet|NeedsReviewSheet)"}/
      ),
    },
    expect.any(Function)
  );
}

/**
 * Interpretation is generally the slowest part of tests in this file. To speed
 * up a test, you can use this function to mock interpretation. It should only
 * be used when:
 * - The test isn't meant to check that interpretation works correctly. There
 *   should already be another test that covers the same interpretation case.
 * - The test doesn't check the CVR export at the end. The interpreter stores
 *   the ballot images which are used in the CVR, and mocking will forgo that
 *   logic.
 * - The test doesn't depend on the actual page interpretations. This function
 *   adds fake page interpretations that don't actually match the passed in
 *   ballot interpretation (because the state machine doesn't actually use those
 *   page interpretations, they are just stored for the CVR).
 */
function mockInterpretation(
  interpreter: PrecinctScannerInterpreter,
  interpretation: SheetInterpretation,
  filenameSuffix = ''
) {
  jest.spyOn(interpreter, 'interpret').mockResolvedValue(
    ok({
      ...interpretation,
      pages: [
        {
          interpretation: { type: 'BlankPage' },
          originalFilename: `fake_original_filename_${filenameSuffix}`,
          normalizedFilename: `fake_normalized_filename_${filenameSuffix}`,
        },
        {
          interpretation: { type: 'BlankPage' },
          originalFilename: `fake_original_filename_${filenameSuffix}`,
          normalizedFilename: `fake_normalized_filename_${filenameSuffix}`,
        },
      ],
    })
  );
}

test('configure and scan hmpb', async () => {
  const { apiClient, mockScanner, mockUsb, logger } =
    await createCustomScannerApp();
  await configureApp(apiClient, mockUsb, { addTemplates: true });

  (
    await mockScanner.simulateLoadSheet(await customBallotImages.completeHmpb())
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'ready_to_accept', interpretation });

  await apiClient.acceptBallot();
  await expectStatus(apiClient, {
    state: 'accepting',
    interpretation,
  });
  await waitForStatus(apiClient, {
    state: 'accepted',
    interpretation,
    ballotsCounted: 1,
  });

  // Test waiting for automatic transition back to no_paper
  await waitForStatus(apiClient, { state: 'no_paper', ballotsCounted: 1 });

  // Check the CVR
  const cvrs = await apiClient.getCastVoteRecordsForTally();
  expect(cvrs).toHaveLength(1);
  // TODO what do we actually want to check about the CVRs to make sure they work?

  checkLogs(logger);
});

test('configure and scan bmd ballot', async () => {
  const { apiClient, mockScanner, mockUsb, logger } =
    await createCustomScannerApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockScanner.simulateLoadSheet(await customBallotImages.completeBmd())
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'ready_to_accept', interpretation });

  await apiClient.acceptBallot();
  await expectStatus(apiClient, {
    state: 'accepting',
    interpretation,
  });
  await waitForStatus(apiClient, {
    state: 'accepted',
    interpretation,
    ballotsCounted: 1,
  });

  // Test scanning again without first transitioning back to no_paper
  (
    await mockScanner.simulateLoadSheet(await customBallotImages.completeBmd())
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan', ballotsCounted: 1 });

  // Check the CVR
  const cvrs = await apiClient.getCastVoteRecordsForTally();
  expect(cvrs).toHaveLength(1);

  checkLogs(logger);
});

const needsReviewInterpretation: SheetInterpretation = {
  type: 'NeedsReviewSheet',
  reasons: [{ type: AdjudicationReason.BlankBallot }],
};

test('ballot needs review - return', async () => {
  const { apiClient, mockScanner, workspace, mockUsb, logger } =
    await createCustomScannerApp();
  await configureApp(apiClient, mockUsb, { addTemplates: true });

  (
    await mockScanner.simulateLoadSheet(await customBallotImages.unmarkedHmpb())
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation = needsReviewInterpretation;

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'needs_review', interpretation });

  await apiClient.returnBallot();
  await expectStatus(apiClient, {
    state: 'returning',
    interpretation,
  });
  await waitForStatus(apiClient, {
    state: 'returned',
    interpretation,
  });

  (await mockScanner.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, {
    state: 'no_paper',
  });

  // Check the CVR
  const cvrs = await apiClient.getCastVoteRecordsForTally();
  expect(cvrs).toHaveLength(0);

  // Make sure the ballot was still recorded in the db for backup purposes
  expect(Array.from(workspace.store.getSheets())).toHaveLength(1);

  checkLogs(logger);
});

test('ballot needs review - accept', async () => {
  const { apiClient, mockScanner, mockUsb, logger } =
    await createCustomScannerApp();
  await configureApp(apiClient, mockUsb, { addTemplates: true });

  (
    await mockScanner.simulateLoadSheet(await customBallotImages.unmarkedHmpb())
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation = needsReviewInterpretation;

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'needs_review', interpretation });

  await apiClient.acceptBallot();
  await expectStatus(apiClient, {
    state: 'accepting_after_review',
    interpretation,
  });
  await waitForStatus(apiClient, {
    state: 'accepted',
    interpretation,
    ballotsCounted: 1,
  });

  await waitForStatus(apiClient, {
    state: 'no_paper',
    ballotsCounted: 1,
  });

  // Check the CVR
  const cvrs = await apiClient.getCastVoteRecordsForTally();
  expect(cvrs).toHaveLength(1);

  checkLogs(logger);
});

// TODO test all the invalid ballot reasons?
test('invalid ballot rejected', async () => {
  const { apiClient, mockScanner, workspace, mockUsb, logger } =
    await createCustomScannerApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockScanner.simulateLoadSheet(
      await customBallotImages.wrongElection()
    )
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: SheetInterpretation = {
    type: 'InvalidSheet',
    reason: 'invalid_election_hash',
  };

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, {
    state: 'rejecting',
    interpretation,
  });
  await waitForStatus(apiClient, {
    state: 'rejected',
    interpretation,
  });

  (await mockScanner.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'no_paper' });

  // Check the CVR
  const cvrs = await apiClient.getCastVoteRecordsForTally();
  expect(cvrs).toHaveLength(0);

  // Make sure the ballot was still recorded in the db for backup purposes
  expect(Array.from(workspace.store.getSheets())).toHaveLength(1);

  checkLogs(logger);
});

test('bmd ballot is rejected when scanned for wrong precinct', async () => {
  const { apiClient, mockScanner, mockUsb } = await createCustomScannerApp();
  await configureApp(apiClient, mockUsb, { precinctId: '22' });
  // Ballot should be rejected when configured for the wrong precinct

  (
    await mockScanner.simulateLoadSheet(await customBallotImages.completeBmd())
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: SheetInterpretation = {
    type: 'InvalidSheet',
    reason: 'invalid_precinct',
  };

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, {
    state: 'rejecting',
    interpretation,
  });
  await waitForStatus(apiClient, {
    state: 'rejected',
    interpretation,
  });

  (await mockScanner.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('bmd ballot is accepted if precinct is set for the right precinct', async () => {
  const { apiClient, mockScanner, mockUsb } = await createCustomScannerApp();
  await configureApp(apiClient, mockUsb, { precinctId: '23' });
  // Configure for the proper precinct and verify the ballot scans

  const validInterpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };

  (
    await mockScanner.simulateLoadSheet(await customBallotImages.completeBmd())
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, {
    state: 'ready_to_accept',
    interpretation: validInterpretation,
  });
});

test('hmpb ballot is rejected when scanned for wrong precinct', async () => {
  const { apiClient, mockScanner, mockUsb } = await createCustomScannerApp();
  await configureApp(apiClient, mockUsb, {
    addTemplates: true,
    precinctId: '22',
  });
  // Ballot should be rejected when configured for the wrong precinct

  (
    await mockScanner.simulateLoadSheet(await customBallotImages.completeHmpb())
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: SheetInterpretation = {
    type: 'InvalidSheet',
    reason: 'invalid_precinct',
  };

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, {
    state: 'rejecting',
    interpretation,
  });
  await waitForStatus(apiClient, {
    state: 'rejected',
    interpretation,
  });

  (await mockScanner.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('hmpb ballot is accepted if precinct is set for the right precinct', async () => {
  const { apiClient, mockScanner, mockUsb } = await createCustomScannerApp();
  await configureApp(apiClient, mockUsb, {
    addTemplates: true,
    precinctId: '21',
  });
  // Configure for the proper precinct and verify the ballot scans

  const validInterpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };

  (
    await mockScanner.simulateLoadSheet(await customBallotImages.completeHmpb())
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, {
    state: 'ready_to_accept',
    interpretation: validInterpretation,
  });
});

test('blank sheet ballot rejected', async () => {
  const { apiClient, mockScanner, mockUsb } = await createCustomScannerApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockScanner.simulateLoadSheet(await customBallotImages.blankSheet())
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: SheetInterpretation = {
    type: 'InvalidSheet',
    reason: 'unknown',
  };

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, {
    state: 'rejecting',
    interpretation,
  });
  await waitForStatus(apiClient, {
    state: 'rejected',
    interpretation,
  });

  (await mockScanner.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('scanner powered off while waiting for paper', async () => {
  const { apiClient, mockScanner, mockUsb } = await createCustomScannerApp();
  await configureApp(apiClient, mockUsb);

  mockScanner.simulatePowerOff();
  await waitForStatus(apiClient, { state: 'disconnected' });

  mockScanner.simulatePowerOn();
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('scan command returns an error', async () => {
  const { apiClient, mockScanner, mockUsb } =
    await createSimpleCustomScannerApp();
  await configureApp(apiClient, mockUsb);

  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  mockScanner.scan.mockImplementation(async () => {
    await sleep(100);
    return err(ErrorCode.DeviceAnswerUnknown);
  });
  await apiClient.scanBallot();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, {
    error: 'client_error',
    state: 'recovering_from_error',
  });
  await sleep(3000);
  await waitForStatus(apiClient, {
    error: 'paper_in_back_after_reconnect',
    state: 'rejecting',
  });
});

test('scanner powered off while scanning', async () => {
  const { apiClient, mockScanner, mockUsb } =
    await createSimpleCustomScannerApp();
  await configureApp(apiClient, mockUsb);

  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  mockScanner.scan.mockImplementation(async () => {
    await sleep(1000);
    return err(ErrorCode.NoDeviceAnswer);
  });
  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  mockScanner.getStatus.mockResolvedValue(err(ErrorCode.NoDeviceAnswer));
  mockScanner.connect.mockResolvedValue(err(ErrorCode.NoDeviceAnswer));
  mockScanner.disconnect.mockRejectedValue(new Error('error'));
  await waitForStatus(apiClient, {
    error: 'client_error',
    state: 'recovering_from_error',
  });
  await sleep(3000);
  await waitForStatus(apiClient, { state: 'disconnected' });

  mockScanner.connect.mockResolvedValue(ok());
  mockScanner.disconnect.mockResolvedValue();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_BOTH_SIDES_HAVE_PAPER));
  await waitForStatus(apiClient, {
    error: 'paper_in_both_sides_after_reconnect',
    state: 'rejecting',
  });
});

test('scanner powered off while accepting', async () => {
  const { apiClient, mockScanner, interpreter, mockUsb } =
    await createSimpleCustomScannerApp();
  await configureApp(apiClient, mockUsb);

  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };
  mockInterpretation(interpreter, interpretation);

  mockScanner.scan.mockResolvedValue(
    ok(await customBallotImages.completeBmd())
  );
  await apiClient.scanBallot();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'ready_to_accept', interpretation });
  mockScanner.move.mockImplementation(async () => {
    await sleep(1000);
    return err(ErrorCode.NoDeviceAnswer);
  });
  await apiClient.acceptBallot();
  mockScanner.getStatus.mockResolvedValue(err(ErrorCode.NoDeviceAnswer));
  mockScanner.connect.mockResolvedValue(err(ErrorCode.NoDeviceAnswer));
  mockScanner.disconnect.mockRejectedValue(new Error('error'));
  await waitForStatus(apiClient, {
    state: 'recovering_from_error',
    interpretation,
  });
  await sleep(3000);
  await waitForStatus(apiClient, { state: 'disconnected' });

  mockScanner.connect.mockResolvedValue(ok());
  mockScanner.disconnect.mockResolvedValue();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
  await waitForStatus(apiClient, {
    error: 'paper_in_back_after_reconnect',
    state: 'rejecting',
  });
});

test('scanner powered off after accepting', async () => {
  const { apiClient, mockScanner, interpreter, mockUsb } =
    await createSimpleCustomScannerApp();
  await configureApp(apiClient, mockUsb);

  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };
  mockInterpretation(interpreter, interpretation);

  mockScanner.scan.mockResolvedValue(
    ok(await customBallotImages.completeBmd())
  );
  await apiClient.scanBallot();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'ready_to_accept', interpretation });
  await apiClient.acceptBallot();
  await expectStatus(apiClient, { state: 'accepting', interpretation });
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
  await waitForStatus(apiClient, {
    ballotsCounted: 1,
    state: 'accepted',
    interpretation,
  });
  mockScanner.getStatus.mockResolvedValue(err(ErrorCode.NoDeviceAnswer));
  mockScanner.connect.mockResolvedValue(err(ErrorCode.NoDeviceAnswer));
  mockScanner.disconnect.mockRejectedValue(new Error('error'));
  await waitForStatus(apiClient, {
    state: 'disconnected',
    ballotsCounted: 1,
  });

  mockScanner.connect.mockResolvedValue(ok());
  mockScanner.disconnect.mockResolvedValue();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
  await waitForStatus(apiClient, {
    state: 'no_paper',
    ballotsCounted: 1,
  });
});

test('scanner powered off while rejecting', async () => {
  const { apiClient, mockScanner, interpreter, mockUsb } =
    await createSimpleCustomScannerApp();
  await configureApp(apiClient, mockUsb);

  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: SheetInterpretation = {
    type: 'InvalidSheet',
    reason: 'invalid_election_hash',
  };
  mockInterpretation(interpreter, interpretation);

  mockScanner.scan.mockResolvedValue(
    ok(await customBallotImages.completeBmd())
  );
  await apiClient.scanBallot();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
  await expectStatus(apiClient, { state: 'scanning' });
  mockScanner.move.mockImplementation(async () => {
    await sleep(1000);
    return err(ErrorCode.NoDeviceAnswer);
  });
  await waitForStatus(apiClient, { state: 'rejecting', interpretation });
  mockScanner.getStatus.mockResolvedValue(err(ErrorCode.NoDeviceAnswer));
  mockScanner.connect.mockResolvedValue(err(ErrorCode.NoDeviceAnswer));
  mockScanner.disconnect.mockRejectedValue(new Error('error'));
  await waitForStatus(apiClient, {
    interpretation,
    state: 'recovering_from_error',
  });
  await sleep(3000);
  await waitForStatus(apiClient, { state: 'disconnected' });

  mockScanner.connect.mockResolvedValue(ok());
  mockScanner.disconnect.mockResolvedValue();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
  await waitForStatus(apiClient, {
    error: 'paper_in_back_after_reconnect',
    state: 'rejecting',
  });
});

test('scanner powered off while returning', async () => {
  const { apiClient, mockScanner, interpreter, mockUsb } =
    await createSimpleCustomScannerApp();
  await configureApp(apiClient, mockUsb);

  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: SheetInterpretation = {
    type: 'NeedsReviewSheet',
    reasons: [{ type: AdjudicationReason.BlankBallot }],
  };
  mockInterpretation(interpreter, interpretation);

  mockScanner.scan.mockResolvedValue(
    ok(await customBallotImages.completeBmd())
  );
  await apiClient.scanBallot();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'needs_review', interpretation });
  mockScanner.move.mockImplementation(async () => {
    await sleep(1000);
    return err(ErrorCode.NoDeviceAnswer);
  });
  await apiClient.returnBallot();
  mockScanner.getStatus.mockResolvedValue(err(ErrorCode.NoDeviceAnswer));
  mockScanner.connect.mockResolvedValue(err(ErrorCode.NoDeviceAnswer));
  mockScanner.disconnect.mockRejectedValue(new Error('error'));
  await waitForStatus(apiClient, {
    interpretation,
    state: 'recovering_from_error',
  });
  await sleep(3000);
  await waitForStatus(apiClient, { state: 'disconnected' });

  mockScanner.connect.mockResolvedValue(ok());
  mockScanner.disconnect.mockResolvedValue();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
  await waitForStatus(apiClient, {
    error: 'paper_in_back_after_reconnect',
    state: 'rejecting',
  });
});

test('insert second ballot while first ballot is scanning', async () => {
  const { apiClient, mockScanner, mockUsb } = await createCustomScannerApp({
    delays: {},
    mockScannerOptions: { passthroughDuration: 500 },
  });
  await configureApp(apiClient, mockUsb);

  (
    await mockScanner.simulateLoadSheet(await customBallotImages.completeBmd())
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });

  (
    await mockScanner.simulateLoadSheet(await customBallotImages.completeBmd())
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'both_sides_have_paper' });

  // After removing the second sheet the scan cycle for the first sheet should resume.
  (await mockScanner.simulateRemoveSheet()).unsafeUnwrap();
  const interpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };
  await waitForStatus(apiClient, { state: 'ready_to_accept', interpretation });
});

test('insert second ballot before first ballot accept', async () => {
  const { apiClient, mockScanner, interpreter, mockUsb } =
    await createCustomScannerApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockScanner.simulateLoadSheet(await customBallotImages.completeBmd())
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };
  mockInterpretation(interpreter, interpretation);

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'ready_to_accept', interpretation });
  (
    await mockScanner.simulateLoadSheet(await customBallotImages.completeBmd())
  ).unsafeUnwrap();
  await apiClient.acceptBallot();

  await waitForStatus(apiClient, {
    state: 'both_sides_have_paper',
    interpretation,
  });

  (await mockScanner.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_accept', interpretation });
  await apiClient.acceptBallot();
  await expectStatus(apiClient, { state: 'accepting', interpretation });
  await waitForStatus(apiClient, {
    state: 'accepted',
    interpretation,
    ballotsCounted: 1,
  });
});

test('insert second ballot while first ballot is accepting', async () => {
  const { apiClient, mockScanner, interpreter, mockUsb } =
    await createCustomScannerApp({
      delays: {
        DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT: 1000,
        DELAY_ACCEPTED_RESET_TO_NO_PAPER: 2000,
      },
    });
  await configureApp(apiClient, mockUsb);

  (
    await mockScanner.simulateLoadSheet(await customBallotImages.completeBmd())
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };
  mockInterpretation(interpreter, interpretation);

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'ready_to_accept', interpretation });
  await apiClient.acceptBallot();
  (
    await mockScanner.simulateLoadSheet(await customBallotImages.completeBmd())
  ).unsafeUnwrap();

  // The second ballot will cause a jam but the first ballot should be counted.
  await waitForStatus(apiClient, {
    state: 'accepted',
    interpretation,
    ballotsCounted: 1,
  });
  await waitForStatus(apiClient, {
    state: 'returning_to_rescan',
    ballotsCounted: 1,
  });
  // We have to change the mocks to have a different filename
  mockInterpretation(interpreter, interpretation, 'second');
  (await mockScanner.simulateRemoveSheetFromBack()).unsafeUnwrap();
  await waitForStatus(apiClient, {
    state: 'ready_to_scan',
    ballotsCounted: 1,
  });
  await apiClient.scanBallot();
  await waitForStatus(apiClient, {
    state: 'scanning',
    ballotsCounted: 1,
  });
  await waitForStatus(apiClient, {
    state: 'ready_to_accept',
    interpretation,
    ballotsCounted: 1,
  });
  await apiClient.acceptBallot();
  await expectStatus(apiClient, {
    state: 'accepting',
    interpretation,
    ballotsCounted: 1,
  });
  await waitForStatus(apiClient, {
    state: 'accepted',
    interpretation,
    ballotsCounted: 2,
  });
});

test('insert second ballot while first ballot needs review', async () => {
  const { apiClient, mockScanner, interpreter, mockUsb } =
    await createCustomScannerApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockScanner.simulateLoadSheet(await customBallotImages.unmarkedHmpb())
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation = needsReviewInterpretation;
  mockInterpretation(interpreter, interpretation);

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'needs_review', interpretation });

  (
    await mockScanner.simulateLoadSheet(await customBallotImages.unmarkedHmpb())
  ).unsafeUnwrap();
  await waitForStatus(apiClient, {
    state: 'both_sides_have_paper',
    interpretation,
  });

  (await mockScanner.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'needs_review', interpretation });

  await apiClient.acceptBallot();
  await waitForStatus(apiClient, {
    state: 'accepted',
    interpretation,
    ballotsCounted: 1,
  });
});

test('jam on scan', async () => {
  const { apiClient, mockScanner, mockUsb } = await createCustomScannerApp({
    delays: {
      DELAY_RECONNECT_ON_UNEXPECTED_ERROR: 500,
    },
  });
  await configureApp(apiClient, mockUsb);

  (
    await mockScanner.simulateLoadSheet(await customBallotImages.completeBmd())
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  mockScanner.simulateJamOnNextOperation();
  await apiClient.scanBallot();
  await waitForStatus(apiClient, {
    state: 'recovering_from_error',
    error: 'client_error',
  });
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('jam on accept', async () => {
  const { apiClient, mockScanner, interpreter, mockUsb } =
    await createSimpleCustomScannerApp();
  await configureApp(apiClient, mockUsb);

  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation = needsReviewInterpretation;
  mockInterpretation(interpreter, interpretation);

  mockScanner.scan.mockResolvedValueOnce(
    ok(await customBallotImages.completeBmd())
  );
  await apiClient.scanBallot();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'needs_review', interpretation });

  await apiClient.acceptBallot();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_INTERNAL_JAM));
  await waitForStatus(apiClient, {
    interpretation,
    state: 'jammed',
  });
  expect(mockScanner.resetHardware).not.toHaveBeenCalled();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_JAM_CLEARED));
  await waitForStatus(apiClient, { state: 'jammed' });
  expect(mockScanner.resetHardware).toHaveBeenCalled();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('disconnect when scanner open', async () => {
  const { apiClient, mockScanner, mockUsb } =
    await createSimpleCustomScannerApp();
  await configureApp(apiClient, mockUsb);

  await waitForStatus(apiClient, { state: 'no_paper' });

  mockScanner.getStatus.mockResolvedValue(
    ok({ ...mocks.MOCK_NO_PAPER, isScannerCoverOpen: true })
  );
  await waitForStatus(apiClient, { state: 'disconnected' });

  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));

  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('jam on return', async () => {
  const { apiClient, mockScanner, interpreter, mockUsb } =
    await createSimpleCustomScannerApp();
  await configureApp(apiClient, mockUsb);

  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation = needsReviewInterpretation;
  mockInterpretation(interpreter, interpretation);

  mockScanner.scan.mockResolvedValueOnce(
    ok(await customBallotImages.completeBmd())
  );
  await apiClient.scanBallot();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'needs_review', interpretation });

  await apiClient.returnBallot();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_INTERNAL_JAM));
  await waitForStatus(apiClient, {
    interpretation,
    state: 'jammed',
  });
  expect(mockScanner.resetHardware).not.toHaveBeenCalled();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_JAM_CLEARED));
  await waitForStatus(apiClient, { state: 'jammed' });
  expect(mockScanner.resetHardware).toHaveBeenCalled();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('jam on reject', async () => {
  const { apiClient, mockScanner, interpreter, mockUsb } =
    await createSimpleCustomScannerApp();
  await configureApp(apiClient, mockUsb);

  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: SheetInterpretation = {
    type: 'InvalidSheet',
    reason: 'invalid_election_hash',
  };
  mockInterpretation(interpreter, interpretation);

  mockScanner.scan.mockResolvedValueOnce(
    ok(await customBallotImages.completeBmd())
  );
  await apiClient.scanBallot();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'rejecting', interpretation });

  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_INTERNAL_JAM));
  await waitForStatus(apiClient, {
    interpretation,
    state: 'jammed',
  });
  expect(mockScanner.resetHardware).not.toHaveBeenCalled();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_JAM_CLEARED));
  await waitForStatus(apiClient, { state: 'jammed' });
  expect(mockScanner.resetHardware).toHaveBeenCalled();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('scan fails and retries', async () => {
  const { apiClient, mockScanner, interpreter, mockUsb } =
    await createSimpleCustomScannerApp();
  await configureApp(apiClient, mockUsb);

  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };
  mockInterpretation(interpreter, interpretation);

  mockScanner.scan.mockResolvedValueOnce(err(ErrorCode.NoDocumentToBeScanned));
  mockScanner.scan.mockResolvedValueOnce(
    ok(await customBallotImages.completeBmd())
  );
  await apiClient.scanBallot();
  mockScanner.getStatus.mockResolvedValueOnce(ok(mocks.MOCK_READY_TO_SCAN));
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'ready_to_accept', interpretation });

  expect(mockScanner.scan).toHaveBeenCalledTimes(2);
});

test('scan fails repeatedly and eventually gives up', async () => {
  const { apiClient, mockScanner, interpreter, mockUsb } =
    await createSimpleCustomScannerApp({
      delays: {
        DELAY_RETRY_SCANNING: 10,
        DELAY_PAPER_STATUS_POLLING_INTERVAL: 10,
      },
    });
  await configureApp(apiClient, mockUsb);

  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };
  mockInterpretation(interpreter, interpretation);

  mockScanner.scan.mockResolvedValue(
    ok(await customBallotImages.completeBmd())
  );
  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await sleep(2000);

  // We should retry a total of ten times.
  expect(mockScanner.scan).toHaveBeenCalledTimes(MAX_FAILED_SCAN_ATTEMPTS);
});

test('scanning time out', async () => {
  const { apiClient, mockScanner, interpreter, mockUsb } =
    await createSimpleCustomScannerApp({
      delays: {
        DELAY_SCANNING_TIMEOUT: 50,
      },
    });
  await configureApp(apiClient, mockUsb);

  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };
  mockInterpretation(interpreter, interpretation);

  mockScanner.scan.mockImplementation(async () => {
    await sleep(200);
    return ok(await customBallotImages.completeBmd());
  });
  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await sleep(100);
  await expectStatus(apiClient, {
    state: 'recovering_from_error',
    error: 'scanning_timed_out',
  });
});

test('paper status polling timeout', async () => {
  const { apiClient, mockScanner, mockUsb } =
    await createSimpleCustomScannerApp({
      delays: {
        DELAY_PAPER_STATUS_POLLING_TIMEOUT: 50,
      },
    });
  await configureApp(apiClient, mockUsb);

  mockScanner.getStatus.mockImplementation(async () => {
    await sleep(200);
    return ok(mocks.MOCK_NO_PAPER);
  });
  await waitForStatus(apiClient, {
    state: 'recovering_from_error',
    error: 'paper_status_timed_out',
  });
});

test('jam that custom does not see as a jam', async () => {
  const { apiClient, mockScanner, mockUsb } =
    await createSimpleCustomScannerApp();
  await configureApp(apiClient, mockUsb);

  await expectStatus(apiClient, { state: 'no_paper' });
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_BOTH_SIDES_HAVE_PAPER));
  await waitForStatus(apiClient, {
    state: 'jammed',
  });
});
