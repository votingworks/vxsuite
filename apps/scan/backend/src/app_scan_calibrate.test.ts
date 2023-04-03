import { Logger } from '@votingworks/logging';
import {
  ballotImages,
  configureApp,
  createApp,
  expectStatus,
  waitForStatus,
} from '../test/helpers/app_helpers';

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

test('calibrate', async () => {
  const { apiClient, mockPlustek, mockUsb, mockAuth } = await createApp();
  await configureApp(apiClient, mockUsb, { mockAuth });

  (await mockPlustek.simulateLoadSheet(ballotImages.blankSheet)).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  const calibratePromise = apiClient.calibrate();
  await waitForStatus(apiClient, { state: 'calibrating' });
  expect(await calibratePromise).toEqual(true);
  await expectStatus(apiClient, { state: 'no_paper' });
});

test('calibrate not supported', async () => {
  const { apiClient, mockPlustek, mockUsb, mockAuth } = await createApp();
  await configureApp(apiClient, mockUsb, { mockAuth });

  (await mockPlustek.simulateLoadSheet(ballotImages.blankSheet)).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  mockPlustek.simulateCalibrateNotSupported();
  const calibrateResult = await apiClient.calibrate();
  expect(calibrateResult).toEqual(false);
});

test('jam on calibrate', async () => {
  const { apiClient, mockPlustek, mockUsb, mockAuth } = await createApp();
  await configureApp(apiClient, mockUsb, { mockAuth });

  (await mockPlustek.simulateLoadSheet(ballotImages.blankSheet)).unsafeUnwrap();
  await waitForStatus(apiClient, { state: 'ready_to_scan' });

  mockPlustek.simulateJamOnNextOperation();
  expect(await apiClient.calibrate()).toEqual(false);
  await expectStatus(apiClient, { state: 'jammed' });
});
