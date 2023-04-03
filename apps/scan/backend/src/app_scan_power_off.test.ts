import { Logger } from '@votingworks/logging';
import { AdjudicationReason } from '@votingworks/types';
import {
  ballotImages,
  configureApp,
  expectStatus,
  mockInterpretation,
  waitForStatus,
  withApp,
} from '../test/helpers/app_helpers';
import { SheetInterpretation } from './types';

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
