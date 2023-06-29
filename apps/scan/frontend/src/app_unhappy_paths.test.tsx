/* eslint-disable no-console */
import { electionSampleDefinition } from '@votingworks/fixtures';
import {
  advanceTimersAndPromises,
  fakeKiosk,
  suppressingConsoleOutput,
} from '@votingworks/test-utils';
import { MemoryHardware } from '@votingworks/utils';

import userEvent from '@testing-library/user-event';

import { ServerError } from '@votingworks/grout';
import { fakeLogger } from '@votingworks/logging';
import { PrecinctScannerConfig } from '@votingworks/scan-backend';
import { act, render, screen } from '../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  statusNoPaper,
} from '../test/helpers/mock_api_client';
import { App, AppProps } from './app';

let apiMock: ApiMock;

function renderApp(props: Partial<AppProps> = {}) {
  const hardware = MemoryHardware.build({
    connectPrinter: false,
    connectCardReader: true,
    connectPrecinctScanner: true,
  });
  const logger = fakeLogger();
  render(
    <App
      hardware={hardware}
      logger={logger}
      apiClient={apiMock.mockApiClient}
      {...props}
    />
  );
  return { hardware, logger };
}

beforeEach(() => {
  jest.useFakeTimers();
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.removeCard(); // Set a default auth state of no card inserted.
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('when backend does not respond shows error screen', async () => {
  apiMock.mockApiClient.getConfig
    .expectCallWith()
    .throws(new ServerError('not responding'));
  apiMock.expectGetScannerStatus(statusNoPaper);

  await suppressingConsoleOutput(async () => {
    renderApp();
    await screen.findByText('Something went wrong');
    expect(console.error).toHaveBeenCalled();
  });
});

test('backend fails to unconfigure', async () => {
  apiMock.expectCheckUltrasonicSupported(false);
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus({ ...statusNoPaper, canUnconfigure: true });
  apiMock.mockApiClient.ejectUsbDrive.expectCallWith().resolves();
  apiMock.mockApiClient.unconfigureElection
    .expectCallWith({})
    .throws(new ServerError('failed'));

  renderApp();
  apiMock.authenticateAsElectionManager(electionSampleDefinition);

  userEvent.click(await screen.findByRole('tab', { name: /data/i }));

  await suppressingConsoleOutput(async () => {
    userEvent.click(
      await screen.findByText('Delete All Election Data from VxScan')
    );
    userEvent.click(await screen.findByText('Yes, Delete All'));

    await screen.findByText('Something went wrong');
  });
});

test.each<{
  description: string;
  defaultConfigOverrides: Partial<PrecinctScannerConfig>;
  expectedHeadingWhenNoCard: string;
}>([
  {
    description: 'machine is configured',
    defaultConfigOverrides: {},
    expectedHeadingWhenNoCard: 'Polls Closed',
  },
  {
    description: 'machine is unconfigured',
    defaultConfigOverrides: {
      electionDefinition: undefined,
      precinctSelection: undefined,
    },
    expectedHeadingWhenNoCard: 'VxScan is Not Configured',
  },
])(
  'shows invalid card screen when invalid cards are inserted - $description',
  async ({ defaultConfigOverrides, expectedHeadingWhenNoCard }) => {
    apiMock.expectGetConfig(defaultConfigOverrides);
    apiMock.expectGetScannerStatus(statusNoPaper);
    renderApp();

    await screen.findByText(expectedHeadingWhenNoCard);

    apiMock.setAuthStatus({
      status: 'logged_out',
      reason: 'invalid_user_on_card',
    });
    await screen.findByText('Invalid Card');

    apiMock.removeCard();
    await screen.findByText(expectedHeadingWhenNoCard);

    apiMock.setAuthStatus({
      status: 'logged_out',
      reason: 'election_manager_wrong_election',
    });
    await screen.findByText('Invalid Card');

    apiMock.setAuthStatus({
      status: 'logged_out',
      reason: 'poll_worker_wrong_election',
    });
    await screen.findByText('Invalid Card');

    apiMock.removeCard();
    await screen.findByText(expectedHeadingWhenNoCard);
  }
);

test('show card backwards screen when card connection error occurs', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus(statusNoPaper);
  renderApp();

  await screen.findByText('Polls Closed');
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'card_error',
  });
  await screen.findByText('Card is Backwards');
  screen.getByText('Remove the card, turn it around, and insert it again.');

  apiMock.removeCard();
  await screen.findByText('Polls Closed');
});

test('shows internal wiring message when there is no scanner, but tablet is plugged in', async () => {
  apiMock.expectGetConfig();
  const hardware = MemoryHardware.buildStandard();
  hardware.setPrecinctScannerConnected(false);
  hardware.setBatteryDischarging(false);
  apiMock.expectGetScannerStatus({
    ...statusNoPaper,
    state: 'disconnected',
  });
  renderApp({ hardware });
  await screen.findByRole('heading', { name: 'Internal Connection Problem' });
  screen.getByText('Please ask a poll worker for help.');
});

test('shows power cable message when there is no scanner and tablet is not plugged in', async () => {
  apiMock.expectGetConfig();
  const hardware = MemoryHardware.buildStandard();
  hardware.setPrecinctScannerConnected(false);
  hardware.setBatteryDischarging(true);
  apiMock.expectGetScannerStatus({
    ...statusNoPaper,
    state: 'disconnected',
  });
  renderApp({ hardware });
  await screen.findByRole('heading', { name: 'No Power Detected' });
  screen.getByText('Please ask a poll worker to plug in the power cord.');

  apiMock.expectGetScannerStatus(statusNoPaper);
  act(() => hardware.setPrecinctScannerConnected(true));
  await screen.findByRole('heading', { name: 'Polls Closed' });
});

test('shows instructions to restart when the scanner client crashed', async () => {
  apiMock.expectGetConfig({ pollsState: 'polls_open' });
  const hardware = MemoryHardware.buildStandard();
  hardware.setPrecinctScannerConnected(false);
  apiMock.expectGetScannerStatus({
    ...statusNoPaper,
    state: 'unrecoverable_error',
  });
  renderApp({ hardware });
  await screen.findByRole('heading', { name: 'Ballot Not Counted' });
  screen.getByText('Ask a poll worker to restart the scanner.');
});

test('App shows warning message to connect to power when disconnected', async () => {
  apiMock.expectGetConfig();
  const hardware = MemoryHardware.buildStandard();
  hardware.setPrinterConnected(false);
  hardware.setBatteryDischarging(true);
  hardware.setBatteryLevel(0.9);
  const kiosk = fakeKiosk();
  window.kiosk = kiosk;
  apiMock.expectGetScannerStatus(statusNoPaper);
  renderApp({ hardware });
  apiMock.expectGetCastVoteRecordsForTally([]);
  await screen.findByText('Polls Closed');
  await screen.findByText('No Power Detected.');
  await screen.findByText(
    'Please ask a poll worker to plug in the power cord.'
  );
  // Plug in power and see that warning goes away
  act(() => {
    hardware.setBatteryDischarging(false);
  });

  await screen.findByText('Polls Closed');
  await advanceTimersAndPromises(3);
  expect(screen.queryByText('No Power Detected.')).toBeNull();

  // Open Polls
  apiMock.authenticateAsPollWorker(electionSampleDefinition);
  apiMock.expectSetPollsState('polls_open');
  apiMock.expectGetConfig({ pollsState: 'polls_open' });
  userEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText('Polls are open.');
  expect(
    apiMock.mockApiClient.saveScannerReportDataToCard
  ).toHaveBeenCalledTimes(1);
  expect(
    apiMock.mockApiClient.saveScannerReportDataToCard
  ).toHaveBeenNthCalledWith(1, {
    scannerReportData: expect.anything(),
  });

  // Remove pollworker card
  apiMock.removeCard();
  await screen.findByText(/Insert Your Ballot/i);
  // There should be no warning about power
  expect(screen.queryByText('No Power Detected.')).toBeNull();
  // Disconnect from power and check for warning
  act(() => {
    hardware.setBatteryDischarging(true);
  });
  await screen.findByText('No Power Detected.');
});
