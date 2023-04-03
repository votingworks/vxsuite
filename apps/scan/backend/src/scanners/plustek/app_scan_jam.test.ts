import { AdjudicationReason } from '@votingworks/types';
import {
  configureApp,
  expectStatus,
  mockInterpretation,
  waitForStatus,
} from '../../../test/helpers/shared_helpers';
import { SheetInterpretation } from '../../types';
import { ballotImages, withApp } from '../../../test/helpers/plustek_helpers';

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
    async ({ apiClient, mockPlustek, mockUsb, mockAuth }) => {
      await configureApp(apiClient, mockUsb, { mockAuth });

      (
        await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
      ).unsafeUnwrap();
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      mockPlustek.simulateJamOnNextOperation();
      await apiClient.scanBallot();
      await waitForStatus(apiClient, {
        state: 'recovering_from_error',
        error: 'client_error',
      });
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
    async ({ apiClient, mockPlustek, interpreter, mockUsb, mockAuth }) => {
      await configureApp(apiClient, mockUsb, { mockAuth });

      (
        await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
      ).unsafeUnwrap();
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };
      mockInterpretation(interpreter, interpretation);

      await apiClient.scanBallot();
      await waitForStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });

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
    }
  );
});

test('jam on return', async () => {
  await withApp(
    {},
    async ({ apiClient, mockPlustek, interpreter, mockUsb, mockAuth }) => {
      await configureApp(apiClient, mockUsb, { mockAuth });

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
    }
  );
});

test('jam on reject', async () => {
  await withApp(
    {},
    async ({ apiClient, mockPlustek, interpreter, mockUsb, mockAuth }) => {
      await configureApp(apiClient, mockUsb, { mockAuth });

      (
        await mockPlustek.simulateLoadSheet(ballotImages.wrongElection)
      ).unsafeUnwrap();
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
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
    }
  );
});
