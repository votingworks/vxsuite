import { AdjudicationReason } from '@votingworks/types';
import { ErrorCode, mocks } from '@votingworks/custom-scanner';
import { err, ok } from '@votingworks/basics';
import {
  configureApp,
  expectStatus,
  mockInterpretation,
  waitForStatus,
} from '../../../test/helpers/shared_helpers';
import { SheetInterpretation } from '../../types';
import { ballotImages, withApp } from '../../../test/helpers/custom_helpers';

jest.setTimeout(20_000);

const needsReviewInterpretation: SheetInterpretation = {
  type: 'NeedsReviewSheet',
  reasons: [{ type: AdjudicationReason.BlankBallot }],
};

test('scanner powered off while waiting for paper', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockUsbDrive, { mockAuth });

      mockScanner.getStatus.mockResolvedValue(err(ErrorCode.ScannerOffline));
      await waitForStatus(apiClient, { state: 'disconnected' });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('scanner powered off while scanning', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockUsbDrive, { mockAuth });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      mockScanner.scan.mockResolvedValue(ok(await ballotImages.completeBmd()));
      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.getStatus.mockResolvedValue(err(ErrorCode.ScannerOffline));
      await waitForStatus(apiClient, { state: 'disconnected' });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_INTERNAL_JAM));
      await waitForStatus(apiClient, { state: 'jammed' });
    }
  );
});

test('scanner powered off while accepting', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, interpreter, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockUsbDrive, { mockAuth });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };
      mockInterpretation(interpreter, interpretation);

      mockScanner.scan.mockResolvedValue(ok(await ballotImages.completeBmd()));
      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });
      await apiClient.acceptBallot();
      mockScanner.getStatus.mockResolvedValue(err(ErrorCode.ScannerOffline));
      await waitForStatus(apiClient, { state: 'disconnected' });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await waitForStatus(apiClient, {
        state: 'rejecting',
        error: 'paper_in_back_after_reconnect',
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, {
        state: 'rejected',
        error: 'paper_in_back_after_reconnect',
      });
    }
  );
});

test('scanner powered off after accepting', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, interpreter, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockUsbDrive, { mockAuth });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };
      mockInterpretation(interpreter, interpretation);

      mockScanner.scan.mockResolvedValue(ok(await ballotImages.completeBmd()));
      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });
      await apiClient.acceptBallot();
      await waitForStatus(apiClient, {
        state: 'accepting',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 1,
      });

      mockScanner.getStatus.mockResolvedValue(err(ErrorCode.ScannerOffline));
      await waitForStatus(apiClient, {
        state: 'disconnected',
        ballotsCounted: 1,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, { state: 'no_paper', ballotsCounted: 1 });
    }
  );
});

test('scanner powered off while rejecting', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, interpreter, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockUsbDrive, { mockAuth });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'invalid_election_hash',
      };
      mockInterpretation(interpreter, interpretation);

      mockScanner.scan.mockResolvedValue(
        ok(await ballotImages.wrongElection())
      );
      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await waitForStatus(apiClient, {
        state: 'rejecting',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(err(ErrorCode.ScannerOffline));
      await waitForStatus(apiClient, { state: 'disconnected' });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_INTERNAL_JAM));
      await waitForStatus(apiClient, { state: 'jammed' });
    }
  );
});

test('scanner powered off while returning', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, interpreter, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockUsbDrive, { mockAuth });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation = needsReviewInterpretation;
      mockInterpretation(interpreter, interpretation);

      mockScanner.scan.mockResolvedValue(ok(await ballotImages.unmarkedHmpb()));
      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await waitForStatus(apiClient, { state: 'needs_review', interpretation });

      await apiClient.returnBallot();
      await waitForStatus(apiClient, {
        state: 'returning',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(err(ErrorCode.ScannerOffline));
      await waitForStatus(apiClient, { state: 'disconnected' });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_INTERNAL_JAM));
      await waitForStatus(apiClient, { state: 'jammed' });
    }
  );
});

test('scanner powered off after returning', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, interpreter, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockUsbDrive, { mockAuth });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation = needsReviewInterpretation;
      mockInterpretation(interpreter, interpretation);

      mockScanner.scan.mockResolvedValue(ok(await ballotImages.unmarkedHmpb()));
      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await waitForStatus(apiClient, { state: 'needs_review', interpretation });

      await apiClient.returnBallot();
      await waitForStatus(apiClient, {
        state: 'returning',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, {
        state: 'returned',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(err(ErrorCode.ScannerOffline));
      await waitForStatus(apiClient, { state: 'disconnected' });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, {
        state: 'rejected',
        error: 'paper_in_front_after_reconnect',
      });
    }
  );
});
