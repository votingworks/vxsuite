/* eslint-disable no-console */
import { beforeEach, vi, afterEach, test, expect } from 'vitest';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { suppressingConsoleOutput } from '@votingworks/test-utils';

import userEvent from '@testing-library/user-event';

import { ServerError } from '@votingworks/grout';
import {
  PrecinctScannerConfig,
  FujitsuErrorType,
} from '@votingworks/scan-backend';
import { render, screen, waitFor } from '../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  statusNoPaper,
} from '../test/helpers/mock_api_client';
import { App, AppProps } from './app';

let apiMock: ApiMock;

function renderApp(props: Partial<AppProps> = {}) {
  render(<App apiClient={apiMock.mockApiClient} {...props} />);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
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
  apiMock.expectGetPollsInfo();
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatusV4();
  vi.spyOn(console, 'error').mockReturnValue();
  renderApp();
  await screen.findByText('Something went wrong');
  expect(console.error).toHaveBeenCalled();
});

test('backend fails to unconfigure', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo();
  apiMock.setPrinterStatusV3({ connected: true });
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.mockApiClient.ejectUsbDrive.expectCallWith().resolves();
  apiMock.mockApiClient.unconfigureElection
    .expectCallWith()
    .throws(new ServerError('failed'));

  renderApp();
  apiMock.authenticateAsElectionManager(electionGeneralDefinition);

  userEvent.click(await screen.findByRole('tab', { name: 'Configuration' }));

  await suppressingConsoleOutput(async () => {
    userEvent.click(await screen.findByText('Unconfigure Machine'));
    userEvent.click(await screen.findByText('Delete All Election Data'));

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
    expectedHeadingWhenNoCard:
      'Insert an election manager card to configure VxScan',
  },
])(
  'shows invalid card screen when invalid cards are inserted - $description',
  async ({ defaultConfigOverrides, expectedHeadingWhenNoCard }) => {
    apiMock.expectGetConfig(defaultConfigOverrides);
    apiMock.expectGetPollsInfo();
    apiMock.expectGetScannerStatus(statusNoPaper);
    apiMock.setPrinterStatusV4();
    renderApp();

    await screen.findByText(expectedHeadingWhenNoCard);

    apiMock.setAuthStatus({
      status: 'logged_out',
      reason: 'unprogrammed_or_invalid_card',
    });
    await screen.findByText('Invalid Card');

    apiMock.removeCard();
    await screen.findByText(expectedHeadingWhenNoCard);

    apiMock.setAuthStatus({
      status: 'logged_out',
      reason: 'wrong_election',
      cardUserRole: 'election_manager',
    });
    await screen.findByText('Invalid Card');

    apiMock.setAuthStatus({
      status: 'logged_out',
      reason: 'wrong_election',
      cardUserRole: 'poll_worker',
    });
    await screen.findByText('Invalid Card');

    apiMock.removeCard();
    await screen.findByText(expectedHeadingWhenNoCard);
  }
);

test('show card backwards screen when card connection error occurs', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo();
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatusV4();
  renderApp();

  await screen.findByText('Polls Closed');
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'card_error',
  });
  await screen.findByText('Card Backward');
  screen.getByText('Remove the card, turn it around, and insert it again.');

  apiMock.removeCard();
  await screen.findByText('Polls Closed');
});

test('shows message when printer cover is open', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo();
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatusV4({ state: 'cover-open' });
  renderApp();
  // This error does not show up when polls are closed
  await screen.findByRole('heading', { name: 'Polls Closed' });

  // Open Polls
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText(/The paper roll holder is not attached/);
  apiMock.setPrinterStatusV4({ state: 'idle' });
  await waitFor(() => {
    expect(screen.getButton('Open Polls')).toBeEnabled();
  });
  apiMock.expectOpenPolls();
  apiMock.expectPrintReportV4();
  apiMock.expectGetPollsInfo('polls_open');
  userEvent.click(await screen.findByText('Open Polls'));

  // Remove pollworker card
  apiMock.removeCard();
  await screen.findByText(/Insert Your Ballot/);
  apiMock.setPrinterStatusV4({ state: 'cover-open' });

  await screen.findByRole('heading', { name: 'Printer Cover is Open' });
  screen.getByText('Please ask a poll worker for help.');
});

test('shows internal wiring message when there is no scanner', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo();
  apiMock.expectGetScannerStatus({
    ...statusNoPaper,
    state: 'disconnected',
  });
  apiMock.setPrinterStatusV4();
  renderApp();
  await screen.findByRole('heading', { name: 'Internal Connection Problem' });
  await screen.findByText('Scanner is disconnected.');
  screen.getByText('Please ask a poll worker for help.');

  // If you authenticate as a pollworker you can power down.
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Power Down');

  // Election manager screen supersedes the internal connection problem screen.
  apiMock.removeCard();
  apiMock.authenticateAsElectionManager(electionGeneralDefinition);

  await screen.findByText('Election Manager Menu');
  // System Administrator screen supersedes the internal connection problem screen.
  apiMock.removeCard();
  apiMock.authenticateAsSystemAdministrator();

  await screen.findByText('System Administrator Menu');
});

test('shows internal wiring message when there is no printer', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo();
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatusV4({
    state: 'error',
    type: 'disconnected',
  });
  renderApp();
  await screen.findByRole('heading', { name: 'Internal Connection Problem' });
  await screen.findByText('Printer is disconnected.');
  screen.getByText('Please ask a poll worker for help.');

  // If you authenticate as a pollworker you can power down.
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Power Down');

  // Election manager screen supersedes the internal connection problem screen.
  apiMock.removeCard();
  apiMock.authenticateAsElectionManager(electionGeneralDefinition);

  await screen.findByText('Election Manager Menu');
  // System Administrator screen supersedes the internal connection problem screen.
  apiMock.removeCard();
  apiMock.authenticateAsSystemAdministrator();

  await screen.findByText('System Administrator Menu');
});

test('shows internal wiring message when there is no printer or scanner', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo();
  apiMock.expectGetScannerStatus({
    ...statusNoPaper,
    state: 'disconnected',
  });
  apiMock.setPrinterStatusV4({
    state: 'error',
    type: 'disconnected',
  });
  renderApp();
  await screen.findByRole('heading', { name: 'Internal Connection Problem' });
  await screen.findByText('Scanner is disconnected.');
  await screen.findByText('Printer is disconnected.');
  screen.getByText('Please ask a poll worker for help.');

  // If you authenticate as a pollworker you can power down.
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Power Down');

  // Election manager screen supersedes the internal connection problem screen.
  apiMock.removeCard();
  apiMock.authenticateAsElectionManager(electionGeneralDefinition);

  await screen.findByText('Election Manager Menu');
  // System Administrator screen supersedes the internal connection problem screen.
  apiMock.removeCard();
  apiMock.authenticateAsSystemAdministrator();

  await screen.findByText('System Administrator Menu');
});

for (const printerError of [
  'receive-data',
  'supply-voltage',
  'hardware',
  'temperature',
]) {
  test(`shows internal wiring message when printer shows hardware error: ${printerError}`, async () => {
    apiMock.expectGetConfig();
    apiMock.expectGetPollsInfo();
    apiMock.expectGetScannerStatus(statusNoPaper);
    apiMock.setPrinterStatusV4({
      state: 'error',
      type: printerError as FujitsuErrorType,
    });
    renderApp();
    await screen.findByRole('heading', { name: 'Internal Connection Problem' });
    await screen.findByText(/The printer has experienced an unknown error/);
    screen.getByText('Please ask a poll worker for help.');

    // If you authenticate as a pollworker you can power down.
    apiMock.authenticateAsPollWorker(electionGeneralDefinition);
    await screen.findByText('Power Down');

    // Election manager screen supersedes the internal connection problem screen.
    apiMock.removeCard();
    apiMock.authenticateAsElectionManager(electionGeneralDefinition);

    await screen.findByText('Election Manager Menu');
    // System Administrator screen supersedes the internal connection problem screen.
    apiMock.removeCard();
    apiMock.authenticateAsSystemAdministrator();

    await screen.findByText('System Administrator Menu');
  });
}

test('shows message when scanner cover is open', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo();
  apiMock.expectGetScannerStatus({
    ...statusNoPaper,
    state: 'cover_open',
  });
  apiMock.setPrinterStatusV3({ connected: true });
  renderApp();
  // This error does not show up when polls are closed
  await screen.findByRole('heading', { name: 'Polls Closed' });

  // Open Polls
  apiMock.authenticateAsPollWorker(electionGeneralDefinition);
  await screen.findByText('Open Polls');
  apiMock.expectOpenPolls();
  apiMock.expectPrintReportV3();
  apiMock.expectGetPollsInfo('polls_open');
  userEvent.click(await screen.findByText('Open Polls'));
  await screen.findByText('Polls Opened');

  // Remove pollworker card
  apiMock.removeCard();

  await screen.findByRole('heading', { name: 'Scanner Cover is Open' });
  screen.getByText('Please ask a poll worker for help.');
});

test('shows instructions to restart when the scanner client crashed', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo('polls_open');
  apiMock.expectGetScannerStatus({
    ...statusNoPaper,
    state: 'unrecoverable_error',
  });
  apiMock.setPrinterStatusV4();
  renderApp();
  await screen.findByRole('heading', { name: 'Ballot Not Counted' });
  screen.getByText('Ask a poll worker to restart the scanner.');
});
