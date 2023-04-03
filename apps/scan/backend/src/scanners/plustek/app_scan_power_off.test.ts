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

test('scanner powered off while waiting for paper', async () => {
  await withApp({}, async ({ apiClient, mockPlustek, mockUsb, mockAuth }) => {
    await configureApp(apiClient, mockUsb, { mockAuth });

    mockPlustek.simulatePowerOff();
    await waitForStatus(apiClient, { state: 'disconnected' });

    mockPlustek.simulatePowerOn();
    await waitForStatus(apiClient, { state: 'no_paper' });
  });
});

test('scanner powered off while scanning', async () => {
  await withApp({}, async ({ apiClient, mockPlustek, mockUsb, mockAuth }) => {
    await configureApp(apiClient, mockUsb, { mockAuth });

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
});

test('scanner powered off while accepting', async () => {
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
    }
  );
});

test('scanner powered off after accepting', async () => {
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
    }
  );
});

test('scanner powered off while rejecting', async () => {
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
      await waitForStatus(apiClient, {
        state: 'rejecting',
        interpretation,
      });

      mockPlustek.simulatePowerOff();
      await waitForStatus(apiClient, { state: 'disconnected' });

      mockPlustek.simulatePowerOn('jam');
      await waitForStatus(apiClient, { state: 'jammed' });
    }
  );
});

test('scanner powered off while returning', async () => {
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

      await apiClient.returnBallot();
      await waitForStatus(apiClient, {
        state: 'returning',
        interpretation,
      });

      mockPlustek.simulatePowerOff();
      await waitForStatus(apiClient, { state: 'disconnected' });

      mockPlustek.simulatePowerOn('jam');
      await waitForStatus(apiClient, { state: 'jammed' });
    }
  );
});

test('scanner powered off after returning', async () => {
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
    }
  );
});
