import { AdjudicationReason } from '@votingworks/types';
import { ok } from '@votingworks/basics';
import { mocks } from '@votingworks/custom-scanner';
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

test('jam on scan', async () => {
  await withApp(
    {
      delays: {
        DELAY_RECONNECT_ON_UNEXPECTED_ERROR: 500,
      },
    },
    async ({ apiClient, mockScanner, mockUsb, mockAuth }) => {
      await configureApp(apiClient, mockUsb, { mockAuth });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      await apiClient.scanBallot();
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_INTERNAL_JAM));
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
  await withApp(
    {
      delays: {
        DELAY_ACCEPTING_TIMEOUT: 500,
      },
    },
    async ({ apiClient, mockScanner, interpreter, mockUsb, mockAuth }) => {
      await configureApp(apiClient, mockUsb, { mockAuth, testMode: true });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };
      mockInterpretation(interpreter, interpretation);

      mockScanner.scan.mockResolvedValue(ok(await ballotImages.completeBmd()));
      await apiClient.scanBallot();
      await waitForStatus(apiClient, { state: 'scanning' });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });

      await apiClient.acceptBallot();
      await waitForStatus(apiClient, { state: 'accepting', interpretation });
      // The paper can't get permanently jammed on accept - it just stays held in
      // the back and we can reject at that point
      await waitForStatus(apiClient, {
        state: 'rejecting',
        interpretation,
        error: 'paper_in_back_after_accept',
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, {
        state: 'rejected',
        error: 'paper_in_back_after_accept',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('jam on return', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, interpreter, mockUsb, mockAuth }) => {
      await configureApp(apiClient, mockUsb, { mockAuth });

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
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_INTERNAL_JAM));
      await waitForStatus(apiClient, {
        state: 'jammed',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('jam on reject', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, interpreter, mockUsb, mockAuth }) => {
      await configureApp(apiClient, mockUsb, { mockAuth });

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
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_INTERNAL_JAM));
      await waitForStatus(apiClient, {
        state: 'jammed',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});
