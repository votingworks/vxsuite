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
  withSimpleCustomScannerApp,
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
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, mockUsb, logger }) => {
      await configureApp(apiClient, mockUsb, { addTemplates: true });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };

      mockScanner.scan.mockResolvedValueOnce(
        ok(await customBallotImages.completeHmpb())
      );
      await apiClient.scanBallot();
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });
      await apiClient.acceptBallot();
      await expectStatus(apiClient, { state: 'accepting', interpretation });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, {
        ballotsCounted: 1,
        state: 'accepted',
        interpretation,
      });

      // Test waiting for automatic transition back to no_paper
      // await waitForStatus(apiClient, { state: 'no_paper', ballotsCounted: 1 });

      // Check the CVR
      const cvrs = await apiClient.getCastVoteRecordsForTally();
      expect(cvrs).toHaveLength(1);
      // TODO what do we actually want to check about the CVRs to make sure they work?

      checkLogs(logger);
    }
  );
});

test('configure and scan bmd ballot', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, mockUsb, logger }) => {
      await configureApp(apiClient, mockUsb);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };

      mockScanner.scan.mockResolvedValueOnce(
        ok(await customBallotImages.completeBmd())
      );
      await apiClient.scanBallot();
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });

      await apiClient.acceptBallot();
      await expectStatus(apiClient, {
        state: 'accepting',
        interpretation,
      });

      // Test scanning again without first transitioning back to no_paper
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 1,
      });
      await waitForStatus(apiClient, {
        state: 'ready_to_scan',
        ballotsCounted: 1,
      });

      // Check the CVR
      const cvrs = await apiClient.getCastVoteRecordsForTally();
      expect(cvrs).toHaveLength(1);

      checkLogs(logger);
    }
  );
});

const needsReviewInterpretation: SheetInterpretation = {
  type: 'NeedsReviewSheet',
  reasons: [{ type: AdjudicationReason.BlankBallot }],
};

test('ballot needs review - return', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, mockUsb, logger, workspace }) => {
      await configureApp(apiClient, mockUsb, { addTemplates: true });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation = needsReviewInterpretation;

      mockScanner.scan.mockResolvedValueOnce(
        ok(await customBallotImages.unmarkedHmpb())
      );
      await apiClient.scanBallot();
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, { state: 'needs_review', interpretation });

      await apiClient.returnBallot();
      await expectStatus(apiClient, {
        state: 'returning',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, {
        state: 'returned',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, {
        state: 'no_paper',
      });

      // Check the CVR
      const cvrs = await apiClient.getCastVoteRecordsForTally();
      expect(cvrs).toHaveLength(0);

      // Make sure the ballot was still recorded in the db for backup purposes
      expect(Array.from(workspace.store.getSheets())).toHaveLength(1);

      checkLogs(logger);
    }
  );
});

test('ballot needs review - accept', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, mockUsb, logger }) => {
      await configureApp(apiClient, mockUsb, { addTemplates: true });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation = needsReviewInterpretation;

      mockScanner.scan.mockResolvedValueOnce(
        ok(await customBallotImages.unmarkedHmpb())
      );
      await apiClient.scanBallot();
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, { state: 'needs_review', interpretation });

      await apiClient.acceptBallot();
      await expectStatus(apiClient, {
        state: 'accepting_after_review',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
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
    }
  );
});

test('invalid ballot rejected', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, mockUsb, logger, workspace }) => {
      await configureApp(apiClient, mockUsb);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'invalid_election_hash',
      };

      mockScanner.scan.mockResolvedValueOnce(
        ok(await customBallotImages.wrongElection())
      );
      await apiClient.scanBallot();
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, {
        state: 'rejecting',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, {
        state: 'rejected',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, { state: 'no_paper' });

      // Check the CVR
      const cvrs = await apiClient.getCastVoteRecordsForTally();
      expect(cvrs).toHaveLength(0);

      // Make sure the ballot was still recorded in the db for backup purposes
      expect(Array.from(workspace.store.getSheets())).toHaveLength(1);

      checkLogs(logger);
    }
  );
});

test('bmd ballot is rejected when scanned for wrong precinct', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, mockUsb }) => {
      await configureApp(apiClient, mockUsb, { precinctId: '22' });
      // Ballot should be rejected when configured for the wrong precinct

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'invalid_precinct',
      };

      mockScanner.scan.mockResolvedValueOnce(
        ok(await customBallotImages.completeBmd())
      );
      await apiClient.scanBallot();
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, {
        state: 'rejecting',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, {
        state: 'rejected',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('bmd ballot is accepted if precinct is set for the right precinct', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, mockUsb }) => {
      await configureApp(apiClient, mockUsb, { precinctId: '23' });
      // Configure for the proper precinct and verify the ballot scans

      const validInterpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      mockScanner.scan.mockResolvedValueOnce(
        ok(await customBallotImages.completeBmd())
      );
      await apiClient.scanBallot();
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation: validInterpretation,
      });
    }
  );
});

test('hmpb ballot is rejected when scanned for wrong precinct', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, mockUsb }) => {
      // Ballot should be rejected when configured for the wrong precinct
      await configureApp(apiClient, mockUsb, {
        addTemplates: true,
        precinctId: '22',
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'invalid_precinct',
      };

      mockScanner.scan.mockResolvedValueOnce(
        ok(await customBallotImages.completeHmpb())
      );
      await apiClient.scanBallot();
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, {
        state: 'rejecting',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, {
        state: 'rejected',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('hmpb ballot is accepted if precinct is set for the right precinct', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, mockUsb }) => {
      await configureApp(apiClient, mockUsb, {
        addTemplates: true,
        precinctId: '21',
      });
      // Configure for the proper precinct and verify the ballot scans

      const validInterpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      mockScanner.scan.mockResolvedValueOnce(
        ok(await customBallotImages.completeHmpb())
      );
      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation: validInterpretation,
      });
    }
  );
});

test('blank sheet ballot rejected', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, mockUsb }) => {
      await configureApp(apiClient, mockUsb);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'unknown',
      };

      mockScanner.scan.mockResolvedValueOnce(
        ok(await customBallotImages.blankSheet())
      );
      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await waitForStatus(apiClient, {
        state: 'rejecting',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, {
        state: 'rejected',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('scanner powered off while waiting for paper', async () => {
  await withSimpleCustomScannerApp(
    { delays: { DELAY_RECONNECT_ON_UNEXPECTED_ERROR: 0 } },
    async ({ apiClient, mockScanner, mockUsb }) => {
      await configureApp(apiClient, mockUsb);

      mockScanner.getStatus.mockRejectedValue(err(ErrorCode.NoDeviceAnswer));
      await waitForStatus(apiClient, {
        state: 'recovering_from_error',
        error: 'client_error',
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('scan command returns an error', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, mockUsb }) => {
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
    }
  );
});

test('scanner powered off while scanning', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, mockUsb }) => {
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
      mockScanner.getStatus.mockResolvedValue(
        ok(mocks.MOCK_BOTH_SIDES_HAVE_PAPER)
      );
      await waitForStatus(apiClient, {
        error: 'paper_in_both_sides_after_reconnect',
        state: 'rejecting',
      });
    }
  );
});

test('scanner powered off while accepting', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, interpreter, mockUsb }) => {
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
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });
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
    }
  );
});

test('scanner powered off after accepting', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, interpreter, mockUsb }) => {
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
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });
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
    }
  );
});

test('scanner powered off while rejecting', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, interpreter, mockUsb }) => {
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
    }
  );
});

test('scanner powered off while returning', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, interpreter, mockUsb }) => {
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
    }
  );
});

test('insert second ballot while first ballot is scanning', async () => {
  await withSimpleCustomScannerApp(
    { delays: {} },
    async ({ apiClient, mockScanner, mockUsb }) => {
      await configureApp(apiClient, mockUsb);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      mockScanner.scan.mockResolvedValueOnce(
        ok(await customBallotImages.completeBmd())
      );
      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });

      mockScanner.getStatus.mockResolvedValue(
        ok(mocks.MOCK_BOTH_SIDES_HAVE_PAPER)
      );
      await waitForStatus(apiClient, { state: 'both_sides_have_paper' });

      // After removing the second sheet the scan cycle for the first sheet should resume.
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });
    }
  );
});

test('insert second ballot while first ballot is accepting', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, mockUsb }) => {
      await configureApp(apiClient, mockUsb);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };

      mockScanner.scan.mockResolvedValueOnce(
        ok(await customBallotImages.completeBmd())
      );
      await apiClient.scanBallot();
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(
        ok(mocks.MOCK_BOTH_SIDES_HAVE_PAPER)
      );
      await apiClient.acceptBallot();

      await waitForStatus(apiClient, {
        state: 'returning_to_rescan',
        ballotsCounted: 1,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, {
        state: 'ready_to_scan',
        ballotsCounted: 1,
      });

      mockScanner.scan.mockResolvedValueOnce(
        ok(await customBallotImages.completeBmd())
      );
      await apiClient.scanBallot();
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
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
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 2,
      });
    }
  );
});

test('insert second ballot while first ballot needs review', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, interpreter, mockUsb }) => {
      await configureApp(apiClient, mockUsb);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation = needsReviewInterpretation;
      mockInterpretation(interpreter, interpretation);

      mockScanner.scan.mockResolvedValueOnce(
        ok(await customBallotImages.unmarkedHmpb())
      );
      await apiClient.scanBallot();
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, { state: 'needs_review', interpretation });

      mockScanner.getStatus.mockResolvedValue(
        ok(mocks.MOCK_BOTH_SIDES_HAVE_PAPER)
      );
      await waitForStatus(apiClient, {
        state: 'both_sides_have_paper',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await waitForStatus(apiClient, { state: 'needs_review', interpretation });

      await apiClient.acceptBallot();
      await expectStatus(apiClient, {
        state: 'accepting_after_review',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 1,
      });
    }
  );
});

test('jam on scan', async () => {
  await withSimpleCustomScannerApp(
    {
      delays: {
        DELAY_RECONNECT_ON_UNEXPECTED_ERROR: 500,
      },
    },
    async ({ apiClient, mockScanner, mockUsb }) => {
      await configureApp(apiClient, mockUsb);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      mockScanner.scan.mockRejectedValueOnce(err(ErrorCode.PaperJam));
      await apiClient.scanBallot();
      await waitForStatus(apiClient, {
        state: 'recovering_from_error',
        error: 'client_error',
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('jam on accept', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, interpreter, mockUsb }) => {
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
    }
  );
});

test('disconnect when scanner open', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, mockUsb }) => {
      await configureApp(apiClient, mockUsb);

      await waitForStatus(apiClient, { state: 'no_paper' });

      mockScanner.getStatus.mockResolvedValue(
        ok({ ...mocks.MOCK_NO_PAPER, isScannerCoverOpen: true })
      );
      await waitForStatus(apiClient, { state: 'disconnected' });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));

      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('jam on return', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, interpreter, mockUsb }) => {
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
    }
  );
});

test('jam on reject', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, interpreter, mockUsb }) => {
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
    }
  );
});

test('scan fails and retries', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, interpreter, mockUsb }) => {
      await configureApp(apiClient, mockUsb);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };
      mockInterpretation(interpreter, interpretation);

      mockScanner.scan.mockResolvedValueOnce(
        err(ErrorCode.NoDocumentToBeScanned)
      );
      mockScanner.scan.mockResolvedValueOnce(
        ok(await customBallotImages.completeBmd())
      );
      await apiClient.scanBallot();
      mockScanner.getStatus.mockResolvedValueOnce(ok(mocks.MOCK_READY_TO_SCAN));
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });

      expect(mockScanner.scan).toHaveBeenCalledTimes(2);
    }
  );
});

test('scan fails repeatedly and eventually gives up', async () => {
  await withSimpleCustomScannerApp(
    {
      delays: {
        DELAY_RETRY_SCANNING: 10,
        DELAY_PAPER_STATUS_POLLING_INTERVAL: 10,
      },
    },
    async ({ apiClient, mockScanner, interpreter, mockUsb }) => {
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
    }
  );
});

test('scanning time out', async () => {
  await withSimpleCustomScannerApp(
    {
      delays: {
        DELAY_SCANNING_TIMEOUT: 50,
      },
    },
    async ({ apiClient, mockScanner, interpreter, mockUsb }) => {
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
    }
  );
});

test('paper status polling timeout', async () => {
  await withSimpleCustomScannerApp(
    {
      delays: {
        DELAY_PAPER_STATUS_POLLING_TIMEOUT: 50,
      },
    },
    async ({ apiClient, mockScanner, mockUsb }) => {
      await configureApp(apiClient, mockUsb);

      mockScanner.getStatus.mockImplementation(async () => {
        await sleep(200);
        return ok(mocks.MOCK_NO_PAPER);
      });
      await waitForStatus(apiClient, {
        state: 'recovering_from_error',
        error: 'paper_status_timed_out',
      });
    }
  );
});

test('jam that custom does not see as a jam', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, mockScanner, mockUsb }) => {
      await configureApp(apiClient, mockUsb);

      await expectStatus(apiClient, { state: 'no_paper' });
      mockScanner.getStatus.mockResolvedValue(
        ok(mocks.MOCK_BOTH_SIDES_HAVE_PAPER)
      );
      await waitForStatus(apiClient, {
        state: 'jammed',
      });
    }
  );
});
