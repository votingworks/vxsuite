import {
  ballotImages,
  configureApp,
  expectStatus,
  waitForStatus,
  withApp,
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

test('calibrate', async () => {
  await withApp({}, async ({ apiClient, mockPlustek, mockUsb, mockAuth }) => {
    await configureApp(apiClient, mockUsb, { mockAuth });

    (
      await mockPlustek.simulateLoadSheet(ballotImages.blankSheet)
    ).unsafeUnwrap();
    await waitForStatus(apiClient, { state: 'ready_to_scan' });

    const calibratePromise = apiClient.calibrate();
    await waitForStatus(apiClient, { state: 'calibrating' });
    expect(await calibratePromise).toEqual(true);
    await expectStatus(apiClient, { state: 'no_paper' });
  });
});

test('calibrate not supported', async () => {
  await withApp({}, async ({ apiClient, mockPlustek, mockUsb, mockAuth }) => {
    await configureApp(apiClient, mockUsb, { mockAuth });

    (
      await mockPlustek.simulateLoadSheet(ballotImages.blankSheet)
    ).unsafeUnwrap();
    await waitForStatus(apiClient, { state: 'ready_to_scan' });

    mockPlustek.simulateCalibrateNotSupported();
    const calibrateResult = await apiClient.calibrate();
    expect(calibrateResult).toEqual(false);
  });
});

test('jam on calibrate', async () => {
  await withApp({}, async ({ apiClient, mockPlustek, mockUsb, mockAuth }) => {
    await configureApp(apiClient, mockUsb, { mockAuth });

    (
      await mockPlustek.simulateLoadSheet(ballotImages.blankSheet)
    ).unsafeUnwrap();
    await waitForStatus(apiClient, { state: 'ready_to_scan' });

    mockPlustek.simulateJamOnNextOperation();
    expect(await apiClient.calibrate()).toEqual(false);
    await expectStatus(apiClient, { state: 'jammed' });
  });
});
