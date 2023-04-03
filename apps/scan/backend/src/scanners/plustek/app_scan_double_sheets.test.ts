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

test('insert second ballot while first ballot is scanning', async () => {
  await withApp(
    {
      delays: {},
      mockPlustekOptions: { passthroughDuration: 500 },
    },
    async ({ apiClient, mockPlustek, mockUsb, mockAuth }) => {
      await configureApp(apiClient, mockUsb, { mockAuth });

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
    }
  );
});

test('insert second ballot before first ballot accept', async () => {
  await withApp(
    {},
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
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });
      (
        await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
      ).unsafeUnwrap();
      await apiClient.acceptBallot();

      await waitForStatus(apiClient, {
        state: 'both_sides_have_paper',
        interpretation,
      });

      (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });
      await apiClient.acceptBallot();
      await expectStatus(apiClient, { state: 'accepting', interpretation });
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 1,
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
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });
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
    }
  );
});

test('insert second ballot while first ballot needs review', async () => {
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
    }
  );
});

test('insert second ballot while first ballot is rejecting', async () => {
  await withApp(
    {
      delays: {},
      mockPlustekOptions: { passthroughDuration: 500 },
    },
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
    }
  );
});

test('insert second ballot while first ballot is returning', async () => {
  await withApp(
    {
      delays: {},
      mockPlustekOptions: { passthroughDuration: 500 },
    },
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
    }
  );
});
