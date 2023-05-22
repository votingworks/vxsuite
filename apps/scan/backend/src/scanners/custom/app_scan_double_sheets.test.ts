import { AdjudicationReason } from '@votingworks/types';
import { ok } from '@votingworks/basics';
import { mocks } from '@votingworks/custom-scanner';
import waitForExpect from 'wait-for-expect';
import {
  configureApp,
  expectStatus,
  mockInterpretation,
  waitForStatus,
} from '../../../test/helpers/shared_helpers';
import { SheetInterpretation } from '../../types';
import {
  ballotImages,
  simulateScan,
  withApp,
} from '../../../test/helpers/custom_helpers';

jest.setTimeout(20_000);

const needsReviewInterpretation: SheetInterpretation = {
  type: 'NeedsReviewSheet',
  reasons: [{ type: AdjudicationReason.BlankBallot }],
};

test('insert second ballot before first ballot accept', async () => {
  await withApp(
    { delays: {} },
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockUsbDrive, { mockAuth, testMode: true });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      mockScanner.scan.mockResolvedValue(ok(await ballotImages.completeBmd()));
      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });

      mockScanner.getStatus.mockResolvedValue(
        ok(mocks.MOCK_BOTH_SIDES_HAVE_PAPER)
      );
      await waitForStatus(apiClient, { state: 'both_sides_have_paper' });

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });

      await apiClient.acceptBallot();
      await waitForStatus(apiClient, { state: 'accepting', interpretation });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, {
        state: 'no_paper',
        ballotsCounted: 1,
        canUnconfigure: true,
      });
    }
  );
});

test('insert second ballot while first ballot is accepting', async () => {
  await withApp(
    {
      delays: {
        DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT: 1000,
        DELAY_ACCEPTED_RESET_TO_NO_PAPER: 2000,
      },
    },
    async ({ apiClient, mockScanner, interpreter, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockUsbDrive, { mockAuth });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };
      mockInterpretation(interpreter, interpretation);

      simulateScan(mockScanner, await ballotImages.completeBmd());
      await apiClient.scanBallot();
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });
      await apiClient.acceptBallot();
      mockScanner.getStatus.mockResolvedValue(
        ok(mocks.MOCK_BOTH_SIDES_HAVE_PAPER)
      );

      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 1,
      });
      await waitForStatus(apiClient, {
        state: 'returning_to_rescan',
        ballotsCounted: 1,
      });
    }
  );
});

test('insert second ballot while first ballot needs review', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, interpreter, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockUsbDrive, { mockAuth });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation = needsReviewInterpretation;
      mockInterpretation(interpreter, interpretation);

      simulateScan(mockScanner, await ballotImages.unmarkedHmpb());
      await apiClient.scanBallot();
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
      await waitForStatus(apiClient, {
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

test('double sheet on scan', async () => {
  await withApp(
    {
      delays: {
        DELAY_RECONNECT_ON_UNEXPECTED_ERROR: 500,
        DELAY_JAM_WHEN_SCANNING: 50,
      },
    },
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockUsbDrive, { mockAuth });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      await apiClient.scanBallot();
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_DOUBLE_SHEET));
      await waitForStatus(apiClient, {
        state: 'double_sheet_jammed',
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_JAM_CLEARED));
      await waitForStatus(apiClient, { state: 'double_sheet_jammed' });
      await waitForExpect(() => {
        expect(mockScanner.resetHardware).toHaveBeenCalled();
      }, 1_000);
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});
