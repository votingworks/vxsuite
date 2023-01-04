import { AdjudicationReason, err, ok } from '@votingworks/types';
import waitForExpect from 'wait-for-expect';
import { Scan } from '@votingworks/api';
import { Logger } from '@votingworks/logging';
import { MAX_FAILED_SCAN_ATTEMPTS } from './state_machine';
import { PrecinctScannerInterpreter } from './interpret';
import {
  ballotImages,
  configureApp,
  createApp,
  expectStatus,
  postExportCvrs,
  waitForStatus,
} from '../test/helpers/app_helpers';

jest.setTimeout(20_000);

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
  interpretation: Scan.SheetInterpretation
) {
  jest.spyOn(interpreter, 'interpret').mockResolvedValue(
    ok({
      ...interpretation,
      pages: [
        {
          interpretation: { type: 'BlankPage' },
          originalFilename: 'fake_original_filename',
          normalizedFilename: 'fake_normalized_filename',
        },
        {
          interpretation: { type: 'BlankPage' },
          originalFilename: 'fake_original_filename',
          normalizedFilename: 'fake_normalized_filename',
        },
      ],
    })
  );
}

test('configure and scan hmpb', async () => {
  const { apiClient, app, mockPlustek, mockUsb, logger } = await createApp();
  await configureApp(apiClient, mockUsb, { addTemplates: true });

  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeHmpb)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: Scan.SheetInterpretation = {
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
  const cvrs = await postExportCvrs(app);
  expect(cvrs).toHaveLength(1);
  // TODO what do we actually want to check about the CVRs to make sure they work?

  checkLogs(logger);
});

test('configure and scan bmd ballot', async () => {
  const { apiClient, app, mockPlustek, mockUsb, logger } = await createApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: Scan.SheetInterpretation = {
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
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan', ballotsCounted: 1 });

  // Check the CVR
  const cvrs = await postExportCvrs(app);
  expect(cvrs).toHaveLength(1);

  checkLogs(logger);
});

const needsReviewInterpretation: Scan.SheetInterpretation = {
  type: 'NeedsReviewSheet',
  reasons: [{ type: AdjudicationReason.BlankBallot }],
};

test('ballot needs review - return', async () => {
  const { apiClient, app, mockPlustek, workspace, mockUsb, logger } =
    await createApp();
  await configureApp(apiClient, mockUsb, { addTemplates: true });

  (
    await mockPlustek.simulateLoadSheet(ballotImages.unmarkedHmpb)
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

  (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, {
    state: 'no_paper',
  });

  // Check the CVR
  const cvrs = await postExportCvrs(app);
  expect(cvrs).toHaveLength(0);

  // Make sure the ballot was still recorded in the db for backup purposes
  expect(Array.from(workspace.store.getSheets())).toHaveLength(1);

  checkLogs(logger);
});

test('ballot needs review - accept', async () => {
  const { apiClient, app, mockPlustek, mockUsb, logger } = await createApp();
  await configureApp(apiClient, mockUsb, { addTemplates: true });

  (
    await mockPlustek.simulateLoadSheet(ballotImages.unmarkedHmpb)
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
  const cvrs = await postExportCvrs(app);
  expect(cvrs).toHaveLength(1);

  checkLogs(logger);
});

// TODO test all the invalid ballot reasons?
test('invalid ballot rejected', async () => {
  const { apiClient, app, mockPlustek, workspace, mockUsb, logger } =
    await createApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.wrongElection)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: Scan.SheetInterpretation = {
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

  (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'no_paper' });

  // Check the CVR
  const cvrs = await postExportCvrs(app);
  expect(cvrs).toHaveLength(0);

  // Make sure the ballot was still recorded in the db for backup purposes
  expect(Array.from(workspace.store.getSheets())).toHaveLength(1);

  checkLogs(logger);
});

test('bmd ballot is rejected when scanned for wrong precinct', async () => {
  const { apiClient, mockPlustek, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb, { precinctId: '22' });
  // Ballot should be rejected when configured for the wrong precinct

  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: Scan.SheetInterpretation = {
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

  (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('bmd ballot is accepted if precinct is set for the right precinct', async () => {
  const { apiClient, mockPlustek, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb, { precinctId: '23' });
  // Configure for the proper precinct and verify the ballot scans

  const validInterpretation: Scan.SheetInterpretation = {
    type: 'ValidSheet',
  };

  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
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
  const { apiClient, mockPlustek, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb, {
    addTemplates: true,
    precinctId: '22',
  });
  // Ballot should be rejected when configured for the wrong precinct

  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeHmpb)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: Scan.SheetInterpretation = {
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

  (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('hmpb ballot is accepted if precinct is set for the right precinct', async () => {
  const { apiClient, mockPlustek, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb, {
    addTemplates: true,
    precinctId: '21',
  });
  // Configure for the proper precinct and verify the ballot scans

  const validInterpretation: Scan.SheetInterpretation = {
    type: 'ValidSheet',
  };

  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeHmpb)
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
  const { apiClient, mockPlustek, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  (await mockPlustek.simulateLoadSheet(ballotImages.blankSheet)).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: Scan.SheetInterpretation = {
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

  (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('scanner powered off while waiting for paper', async () => {
  const { apiClient, mockPlustek, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  mockPlustek.simulatePowerOff();
  await waitForStatus(apiClient, { state: 'disconnected' });

  mockPlustek.simulatePowerOn();
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('scanner powered off while scanning', async () => {
  const { apiClient, mockPlustek, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  mockPlustek.simulatePowerOff();
  await waitForStatus(apiClient, { state: 'disconnected' });

  mockPlustek.simulatePowerOn('jam');
  await waitForStatus(apiClient, { state: 'jammed' });
});

test('scanner powered off while accepting', async () => {
  const { apiClient, mockPlustek, interpreter, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: Scan.SheetInterpretation = {
    type: 'ValidSheet',
  };
  mockInterpretation(interpreter, interpretation);

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'ready_to_accept', interpretation });
  mockPlustek.simulatePowerOff();
  await apiClient.acceptBallot();
  await waitForStatus(apiClient, { state: 'disconnected' });

  mockPlustek.simulatePowerOn('ready_to_eject');
  await waitForStatus(apiClient, {
    state: 'rejecting',
    error: 'paper_in_back_after_reconnect',
  });
  await waitForStatus(apiClient, {
    state: 'rejected',
    error: 'paper_in_back_after_reconnect',
  });
});

test('scanner powered off after accepting', async () => {
  const { apiClient, mockPlustek, interpreter, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: Scan.SheetInterpretation = {
    type: 'ValidSheet',
  };
  mockInterpretation(interpreter, interpretation);

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'ready_to_accept', interpretation });
  await apiClient.acceptBallot();
  await waitForStatus(apiClient, {
    state: 'accepting',
    interpretation,
  });
  await waitForStatus(apiClient, {
    state: 'accepted',
    interpretation,
    ballotsCounted: 1,
  });

  mockPlustek.simulatePowerOff();
  await waitForStatus(apiClient, {
    state: 'disconnected',
    ballotsCounted: 1,
  });

  mockPlustek.simulatePowerOn('no_paper');
  await waitForStatus(apiClient, { state: 'no_paper', ballotsCounted: 1 });
});

test('scanner powered off while rejecting', async () => {
  const { apiClient, mockPlustek, interpreter, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.wrongElection)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: Scan.SheetInterpretation = {
    type: 'InvalidSheet',
    reason: 'invalid_election_hash',
  };
  mockInterpretation(interpreter, interpretation);

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, {
    state: 'rejecting',
    interpretation,
  });

  mockPlustek.simulatePowerOff();
  await waitForStatus(apiClient, { state: 'disconnected' });

  mockPlustek.simulatePowerOn('jam');
  await waitForStatus(apiClient, { state: 'jammed' });
});

test('scanner powered off while returning', async () => {
  const { apiClient, mockPlustek, interpreter, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.unmarkedHmpb)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation = needsReviewInterpretation;
  mockInterpretation(interpreter, interpretation);

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'needs_review', interpretation });

  await apiClient.returnBallot();
  await waitForStatus(apiClient, {
    state: 'returning',
    interpretation,
  });

  mockPlustek.simulatePowerOff();
  await waitForStatus(apiClient, { state: 'disconnected' });

  mockPlustek.simulatePowerOn('jam');
  await waitForStatus(apiClient, { state: 'jammed' });
});

test('scanner powered off after returning', async () => {
  const { apiClient, mockPlustek, interpreter, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.unmarkedHmpb)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation = needsReviewInterpretation;
  mockInterpretation(interpreter, interpretation);

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'needs_review', interpretation });

  await apiClient.returnBallot();
  await waitForStatus(apiClient, {
    state: 'returning',
    interpretation,
  });
  await waitForStatus(apiClient, {
    state: 'returned',
    interpretation,
  });

  mockPlustek.simulatePowerOff();
  await waitForStatus(apiClient, { state: 'disconnected' });

  mockPlustek.simulatePowerOn('ready_to_scan');
  await waitForStatus(apiClient, {
    state: 'rejected',
    error: 'paper_in_front_after_reconnect',
  });
});

test('insert second ballot while first ballot is scanning', async () => {
  const { apiClient, mockPlustek, mockUsb } = await createApp(
    {},
    { passthroughDuration: 500 }
  );
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });

  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await expectStatus(apiClient, { state: 'both_sides_have_paper' });

  (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, {
    state: 'rejecting',
    error: 'both_sides_have_paper',
  });
  await waitForStatus(apiClient, {
    state: 'rejected',
    error: 'both_sides_have_paper',
  });

  (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('insert second ballot before first ballot accept', async () => {
  const { apiClient, mockPlustek, interpreter, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: Scan.SheetInterpretation = {
    type: 'ValidSheet',
  };
  mockInterpretation(interpreter, interpretation);

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'ready_to_accept', interpretation });
  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await apiClient.acceptBallot();

  await waitForStatus(apiClient, {
    state: 'both_sides_have_paper',
    interpretation,
  });

  (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
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
  const { apiClient, mockPlustek, interpreter, mockUsb } = await createApp({
    DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT: 1000,
    DELAY_ACCEPTED_RESET_TO_NO_PAPER: 2000,
  });
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: Scan.SheetInterpretation = {
    type: 'ValidSheet',
  };
  mockInterpretation(interpreter, interpretation);

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'ready_to_accept', interpretation });
  await apiClient.acceptBallot();
  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();

  await waitForStatus(apiClient, {
    state: 'accepted',
    interpretation,
    ballotsCounted: 1,
  });
  await waitForStatus(apiClient, {
    state: 'ready_to_scan',
    ballotsCounted: 1,
  });
});

test('insert second ballot while first ballot needs review', async () => {
  const { apiClient, mockPlustek, interpreter, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.unmarkedHmpb)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation = needsReviewInterpretation;
  mockInterpretation(interpreter, interpretation);

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'needs_review', interpretation });

  (
    await mockPlustek.simulateLoadSheet(ballotImages.unmarkedHmpb)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, {
    state: 'both_sides_have_paper',
    interpretation,
  });

  (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'needs_review', interpretation });

  await apiClient.acceptBallot();
  await waitForStatus(apiClient, {
    state: 'accepted',
    interpretation,
    ballotsCounted: 1,
  });
});

test('insert second ballot while first ballot is rejecting', async () => {
  const { apiClient, mockPlustek, interpreter, mockUsb } = await createApp(
    {},
    { passthroughDuration: 500 }
  );
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.wrongElection)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: Scan.SheetInterpretation = {
    type: 'InvalidSheet',
    reason: 'invalid_election_hash',
  };
  mockInterpretation(interpreter, interpretation);

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, {
    state: 'rejecting',
    interpretation,
  });

  (
    await mockPlustek.simulateLoadSheet(ballotImages.wrongElection)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, {
    state: 'both_sides_have_paper',
    interpretation,
  });

  (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, {
    state: 'rejecting',
    interpretation,
  });
  await waitForStatus(apiClient, {
    state: 'rejected',
    interpretation,
  });

  (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('insert second ballot while first ballot is returning', async () => {
  const { apiClient, mockPlustek, interpreter, mockUsb } = await createApp(
    {},
    { passthroughDuration: 500 }
  );
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.unmarkedHmpb)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation = needsReviewInterpretation;
  mockInterpretation(interpreter, interpretation);

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'needs_review', interpretation });

  await apiClient.returnBallot();
  (
    await mockPlustek.simulateLoadSheet(ballotImages.unmarkedHmpb)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, {
    state: 'both_sides_have_paper',
    interpretation,
  });

  (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, {
    state: 'needs_review',
    interpretation,
  });
  await apiClient.returnBallot();
  await waitForStatus(apiClient, {
    state: 'returned',
    interpretation,
  });

  (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('jam on scan', async () => {
  const { apiClient, mockPlustek, mockUsb } = await createApp({
    DELAY_RECONNECT_ON_UNEXPECTED_ERROR: 500,
  });
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  mockPlustek.simulateJamOnNextOperation();
  await apiClient.scanBallot();
  await waitForStatus(apiClient, {
    state: 'recovering_from_error',
    error: 'plustek_error',
  });
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('jam on accept', async () => {
  const { apiClient, mockPlustek, interpreter, mockUsb } = await createApp({
    DELAY_ACCEPTING_TIMEOUT: 500,
  });
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: Scan.SheetInterpretation = {
    type: 'ValidSheet',
  };
  mockInterpretation(interpreter, interpretation);

  await apiClient.scanBallot();
  await waitForStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'ready_to_accept', interpretation });

  mockPlustek.simulateJamOnNextOperation();
  await apiClient.acceptBallot();
  await waitForStatus(apiClient, { state: 'accepting', interpretation });
  // The paper can't get permanently jammed on accept - it just stays held in
  // the back and we can reject at that point
  await waitForStatus(apiClient, {
    state: 'rejecting',
    interpretation,
    error: 'paper_in_back_after_accept',
  });
  await waitForStatus(apiClient, {
    state: 'rejected',
    error: 'paper_in_back_after_accept',
    interpretation,
  });

  (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('jam on return', async () => {
  const { apiClient, mockPlustek, interpreter, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.unmarkedHmpb)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation = needsReviewInterpretation;
  mockInterpretation(interpreter, interpretation);

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'needs_review', interpretation });

  mockPlustek.simulateJamOnNextOperation();
  await apiClient.returnBallot();
  await waitForStatus(apiClient, {
    state: 'jammed',
    interpretation,
  });

  (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('jam on reject', async () => {
  const { apiClient, mockPlustek, interpreter, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.wrongElection)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: Scan.SheetInterpretation = {
    type: 'InvalidSheet',
    reason: 'invalid_election_hash',
  };
  mockInterpretation(interpreter, interpretation);

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  mockPlustek.simulateJamOnNextOperation();
  await waitForStatus(apiClient, {
    state: 'jammed',
    interpretation,
  });

  (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('calibrate', async () => {
  const { apiClient, mockPlustek, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  (await mockPlustek.simulateLoadSheet(ballotImages.blankSheet)).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const calibratePromise = apiClient.calibrate();
  await waitForStatus(apiClient, { state: 'calibrating' });
  await calibratePromise;
  await expectStatus(apiClient, { state: 'no_paper' });
});

test('jam on calibrate', async () => {
  const { apiClient, mockPlustek, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  (await mockPlustek.simulateLoadSheet(ballotImages.blankSheet)).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  mockPlustek.simulateJamOnNextOperation();
  expect(await apiClient.calibrate()).toEqual(false);
  await expectStatus(apiClient, { state: 'jammed' });
});

test('scan fails and retries', async () => {
  const { apiClient, mockPlustek, logger, interpreter, mockUsb } =
    await createApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const interpretation: Scan.SheetInterpretation = {
    type: 'ValidSheet',
  };
  mockInterpretation(interpreter, interpretation);

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  mockPlustek.simulateScanError('error_feeding');
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, { state: 'ready_to_accept', interpretation });

  // Make sure the underlying error got logged correctly
  expect(logger.log).toHaveBeenCalledWith(
    'scanner-state-machine-transition',
    'system',
    {
      message: 'Context updated',
      changedFields: expect.stringMatching(
        /{"error":"(PLKSS_ERRCODE_PAPER_STATUS_ERROR_FEEDING|PLKSS_ERRCODE_PAPER_STATUS_NO_PAPER)","failedScanAttempts":1}/
      ),
    },
    expect.any(Function)
  );
});

test('scan fails repeatedly and eventually gives up', async () => {
  const { apiClient, mockPlustek, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const scanSpy = jest.spyOn(mockPlustek, 'scan');
  await apiClient.scanBallot();
  for (let i = 0; i < MAX_FAILED_SCAN_ATTEMPTS; i += 1) {
    await waitForExpect(() => {
      expect(scanSpy).toHaveBeenCalledTimes(i + 1);
    });
    await expectStatus(apiClient, { state: 'scanning' });
    mockPlustek.simulateScanError('error_feeding');
  }
  await waitForStatus(apiClient, {
    state: 'rejected',
    error: 'scanning_failed',
  });
});

test('scan fails due to plustek returning only one file instead of two', async () => {
  const { apiClient, mockPlustek, mockUsb, logger } = await createApp();
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  mockPlustek.simulateScanError('only_one_file_returned');
  await waitForStatus(apiClient, {
    state: 'unrecoverable_error',
    error: 'plustek_error',
  });

  // Make sure the underlying error got logged correctly
  expect(logger.log).toHaveBeenCalledWith(
    'scanner-state-machine-transition',
    'system',
    {
      message: 'Context updated',
      changedFields: expect.stringMatching(
        /{"error":{"message":"expected two files, got \[ file1.jpg \]","stack":".*"}}/
      ),
    },
    expect.any(Function)
  );
});

test('scanning time out', async () => {
  const { apiClient, mockPlustek, logger, mockUsb } = await createApp({
    DELAY_SCANNING_TIMEOUT: 50,
    DELAY_RECONNECT_ON_UNEXPECTED_ERROR: 500,
  });
  await configureApp(apiClient, mockUsb);

  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  await waitForStatus(apiClient, {
    state: 'recovering_from_error',
    error: 'scanning_timed_out',
  });
  await waitForStatus(apiClient, { state: 'no_paper' });

  // Make sure the underlying error got logged correctly
  expect(logger.log).toHaveBeenCalledWith(
    'scanner-state-machine-transition',
    'system',
    {
      message: 'Context updated',
      changedFields: expect.stringMatching(
        /{"error":{"type":"scanning_timed_out","message":"scanning_timed_out","stack":".*"}}/
      ),
    },
    expect.any(Function)
  );
});

test('kills plustekctl if it freezes', async () => {
  const { apiClient, mockPlustek, mockUsb } = await createApp({
    DELAY_SCANNING_TIMEOUT: 50,
    DELAY_RECONNECT_ON_UNEXPECTED_ERROR: 500,
    DELAY_KILL_AFTER_DISCONNECT_TIMEOUT: 500,
    DELAY_PAPER_STATUS_POLLING_TIMEOUT: 1000,
  });
  await configureApp(apiClient, mockUsb);

  await waitForStatus(apiClient, { state: 'no_paper' });
  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  mockPlustek.simulatePlustekctlFreeze();
  await waitForStatus(apiClient, {
    state: 'recovering_from_error',
    error: 'paper_status_timed_out',
  });
  await waitForStatus(apiClient, { state: 'no_paper' });
});

test('stops completely if plustekctl freezes and cant be killed', async () => {
  const { apiClient, mockPlustek, mockUsb } = await createApp({
    DELAY_SCANNING_TIMEOUT: 50,
    DELAY_RECONNECT_ON_UNEXPECTED_ERROR: 500,
    DELAY_KILL_AFTER_DISCONNECT_TIMEOUT: 500,
    DELAY_PAPER_STATUS_POLLING_TIMEOUT: 1000,
  });
  await configureApp(apiClient, mockUsb);

  await waitForStatus(apiClient, { state: 'no_paper' });
  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  await apiClient.scanBallot();
  await expectStatus(apiClient, { state: 'scanning' });
  mockPlustek.kill = () => err(new Error('could not kill'));
  mockPlustek.simulatePlustekctlFreeze();
  await waitForStatus(apiClient, {
    state: 'recovering_from_error',
    error: 'paper_status_timed_out',
  });
  await waitForStatus(apiClient, {
    state: 'unrecoverable_error',
    error: 'paper_status_timed_out',
  });
});
