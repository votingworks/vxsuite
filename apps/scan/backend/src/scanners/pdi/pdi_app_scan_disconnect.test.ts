import {
  getFeatureFlagMock,
  BooleanEnvironmentVariableName,
} from '@votingworks/utils';
import { Result, deferred, err, ok, typedAs } from '@votingworks/basics';
import { ScannerError } from '@votingworks/pdi-scanner';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  DEFAULT_SYSTEM_SETTINGS,
  SheetInterpretation,
} from '@votingworks/types';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { SimulatedClock } from 'xstate/lib/SimulatedClock';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { dirSync } from 'tmp';
import { createMockUsbDrive } from '@votingworks/usb-drive';
import waitForExpect from 'wait-for-expect';
import {
  MockPdiScannerClient,
  ballotImages,
  createMockPdiScannerClient,
  mockStatus,
  simulateScan,
  withApp,
} from '../../../test/helpers/pdi_helpers';
import {
  configureApp,
  expectStatus,
  waitForStatus,
} from '../../../test/helpers/shared_helpers';
import { createPrecinctScannerStateMachine, delays } from './state_machine';
import { createWorkspace } from '../../util/workspace';
import { buildMockLogger } from '../../../test/helpers/custom_helpers';

jest.setTimeout(20_000);

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  };
});

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_PDI_SCANNER
  );
});

function simulateDisconnect(mockScanner: MockPdiScannerClient) {
  mockScanner.client.getScannerStatus.mockResolvedValue(
    err({ code: 'disconnected' })
  );
  mockScanner.emitEvent({ event: 'error', code: 'disconnected' });
  mockScanner.client.connect.mockResolvedValue(err({ code: 'disconnected' }));
}

function simulateReconnect(
  mockScanner: MockPdiScannerClient,
  status = mockStatus.idleScanningDisabled
) {
  mockScanner.client.connect.mockResolvedValue(ok());
  mockScanner.setScannerStatus(status);
}

// Since `withApp` automatically connects, we can't use it for this test.
// Instead, we test the state machine directly, since we don't need the whole
// app in this case.
test('scanner disconnected on startup', async () => {
  const mockScanner = createMockPdiScannerClient();
  mockScanner.client.connect.mockResolvedValue(err({ code: 'disconnected' }));
  const clock = new SimulatedClock();
  const mockAuth = buildMockInsertedSmartCardAuth();
  const workspace = createWorkspace(dirSync().name);
  const mockUsbDrive = createMockUsbDrive();
  const logger = buildMockLogger(mockAuth, workspace);
  const precinctScannerMachine = createPrecinctScannerStateMachine({
    auth: mockAuth,
    createScannerClient: () => mockScanner.client,
    workspace,
    logger,
    usbDrive: mockUsbDrive.usbDrive,
    clock,
  });

  expect(precinctScannerMachine.status()).toEqual({ state: 'connecting' });
  await waitForExpect(() => {
    expect(precinctScannerMachine.status()).toEqual({ state: 'disconnected' });
  });
  precinctScannerMachine.stop();
});

test('scanner disconnected while waiting for ballots', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      simulateDisconnect(mockScanner);
      await waitForStatus(apiClient, { state: 'disconnected' });

      clock.increment(delays.DELAY_RECONNECT);
      await waitForStatus(apiClient, { state: 'disconnected' });

      simulateReconnect(mockScanner);
      clock.increment(delays.DELAY_RECONNECT);
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('scanner disconnected while scanning', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      mockScanner.emitEvent({ event: 'scanStart' });
      await expectStatus(apiClient, { state: 'scanning' });

      simulateDisconnect(mockScanner);
      await waitForStatus(apiClient, { state: 'disconnected' });

      simulateReconnect(mockScanner, mockStatus.jammed);
      const deferredEject = deferred<Result<void, ScannerError>>();
      mockScanner.client.ejectDocument.mockResolvedValueOnce(
        deferredEject.promise
      );
      clock.increment(delays.DELAY_RECONNECT);
      await expectStatus(apiClient, {
        state: 'rejecting',
        error: 'paper_in_back_after_reconnect',
      });

      mockScanner.setScannerStatus(mockStatus.documentInFront);
      deferredEject.resolve(ok());
      await waitForStatus(apiClient, {
        state: 'rejected',
        error: 'paper_in_back_after_reconnect',
      });
    }
  );
});

test('scanner disconnected while accepting', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(),
      });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      await simulateScan(
        apiClient,
        mockScanner,
        await ballotImages.completeHmpb()
      );

      const interpretation: SheetInterpretation = { type: 'ValidSheet' };
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });

      await apiClient.acceptBallot();
      await expectStatus(apiClient, { state: 'accepting', interpretation });

      simulateDisconnect(mockScanner);
      await waitForStatus(apiClient, { state: 'disconnected' });

      simulateReconnect(mockScanner, mockStatus.documentInRear);
      clock.increment(delays.DELAY_RECONNECT);
      await waitForStatus(apiClient, {
        state: 'rejecting',
        error: 'paper_in_back_after_reconnect',
      });
    }
  );
});

// It's unlikely to actually disconnect during this exact moment, but it's
// useful to test this error handling path for coverage
test('scanner disconnected while accepting - ejectDocument fails', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(),
      });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      await simulateScan(
        apiClient,
        mockScanner,
        await ballotImages.completeHmpb()
      );

      const interpretation: SheetInterpretation = { type: 'ValidSheet' };
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });

      mockScanner.client.ejectDocument.mockResolvedValueOnce(
        err({ code: 'disconnected' })
      );
      await apiClient.acceptBallot();
      await expectStatus(apiClient, { state: 'disconnected' });
    }
  );
});

test('scanner disconnected after accepting', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(),
      });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      await simulateScan(
        apiClient,
        mockScanner,
        await ballotImages.completeHmpb()
      );

      const interpretation: SheetInterpretation = { type: 'ValidSheet' };
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });

      await apiClient.acceptBallot();
      await expectStatus(apiClient, {
        state: 'accepting',
        interpretation,
      });
      expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith('toRear');
      mockScanner.setScannerStatus(mockStatus.idleScanningDisabled);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 1,
      });

      simulateDisconnect(mockScanner);
      await waitForStatus(apiClient, {
        state: 'disconnected',
        ballotsCounted: 1,
      });

      simulateReconnect(mockScanner, mockStatus.idleScanningDisabled);
      clock.increment(delays.DELAY_RECONNECT);
      await waitForStatus(apiClient, {
        state: 'no_paper',
        ballotsCounted: 1,
      });
    }
  );
});

test('scanner disconnected while rejecting', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      await simulateScan(
        apiClient,
        mockScanner,
        await ballotImages.wrongElectionBmd()
      );

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'invalid_election_hash',
      };
      await waitForStatus(apiClient, { state: 'rejecting', interpretation });

      simulateDisconnect(mockScanner);
      await waitForStatus(apiClient, { state: 'disconnected' });

      simulateReconnect(mockScanner, mockStatus.documentInRear);
      clock.increment(delays.DELAY_RECONNECT);
      await waitForStatus(apiClient, {
        state: 'rejecting',
        error: 'paper_in_back_after_reconnect',
      });
    }
  );
});

// It's unlikely to actually disconnect during this exact moment, but it's
// useful to test this error handling path for coverage
test('scanner disconnected while rejecting - ejectDocument fails', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(),
      });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      mockScanner.client.ejectDocument.mockResolvedValueOnce(
        err({ code: 'disconnected' })
      );

      await simulateScan(
        apiClient,
        mockScanner,
        await ballotImages.wrongElectionBmd()
      );

      await waitForStatus(apiClient, { state: 'disconnected' });
    }
  );
});

test('scanner disconnected while returning', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(
            {
              ...DEFAULT_SYSTEM_SETTINGS,
              precinctScanAdjudicationReasons: [AdjudicationReason.Overvote],
            }
          ),
      });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      await simulateScan(
        apiClient,
        mockScanner,
        await ballotImages.overvoteHmpb()
      );

      const interpretation: SheetInterpretation = {
        type: 'NeedsReviewSheet',
        reasons: [
          expect.objectContaining(
            typedAs<Partial<AdjudicationReasonInfo>>({
              type: AdjudicationReason.Overvote,
            })
          ),
        ],
      };
      await waitForStatus(apiClient, {
        state: 'needs_review',
        interpretation,
      });

      await apiClient.returnBallot();
      await expectStatus(apiClient, { state: 'returning', interpretation });

      simulateDisconnect(mockScanner);
      await waitForStatus(apiClient, { state: 'disconnected' });

      simulateReconnect(mockScanner, mockStatus.documentInRear);
      clock.increment(delays.DELAY_RECONNECT);
      await waitForStatus(apiClient, {
        state: 'rejecting',
        error: 'paper_in_back_after_reconnect',
      });
    }
  );
});

test('scanner disconnected after rejecting', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      await simulateScan(
        apiClient,
        mockScanner,
        await ballotImages.wrongElectionBmd()
      );

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'invalid_election_hash',
      };
      await waitForStatus(apiClient, { state: 'rejecting', interpretation });

      mockScanner.setScannerStatus(mockStatus.documentInFront);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);

      await waitForStatus(apiClient, { state: 'rejected', interpretation });

      simulateDisconnect(mockScanner);
      await waitForStatus(apiClient, { state: 'disconnected' });

      simulateReconnect(mockScanner, mockStatus.documentInFront);
      clock.increment(delays.DELAY_RECONNECT);
      await waitForStatus(apiClient, {
        state: 'rejected',
        error: 'paper_in_front_after_reconnect',
      });
    }
  );
});
