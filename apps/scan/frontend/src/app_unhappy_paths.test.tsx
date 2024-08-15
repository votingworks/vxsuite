/* eslint-disable no-console */
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { suppressingConsoleOutput } from '@votingworks/test-utils';

import userEvent from '@testing-library/user-event';

import { ServerError } from '@votingworks/grout';
import { PrecinctScannerConfig } from '@votingworks/scan-backend';
import { render, screen } from '../test/react_testing_library';
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
  apiMock.expectGetPollsInfo();
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.mockApiClient.reboot.expectCallWith().resolves();
  await suppressingConsoleOutput(async () => {
    renderApp();
    await screen.findByText('Something went wrong');
    expect(console.error).toHaveBeenCalled();
    userEvent.click(await screen.findButton('Restart'));
  });
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
    userEvent.click(await screen.findByText('Yes, Delete Election Data'));

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
      'Insert an Election Manager card to configure VxScan',
  },
])(
  'shows invalid card screen when invalid cards are inserted - $description',
  async ({ defaultConfigOverrides, expectedHeadingWhenNoCard }) => {
    apiMock.expectGetConfig(defaultConfigOverrides);
    apiMock.expectGetPollsInfo();
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
  apiMock.expectGetPollsInfo();
  apiMock.expectGetScannerStatus({
    ...statusNoPaper,
    state: 'disconnected',
  });
  renderApp();
  await screen.findByRole('heading', { name: 'Internal Connection Problem' });
  screen.getByText('Please ask a poll worker for help.');
});

test('shows message when scanner cover is open', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetPollsInfo();
  apiMock.expectGetScannerStatus({
    ...statusNoPaper,
    state: 'cover_open',
  });
  renderApp();
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
  renderApp();
  await screen.findByRole('heading', { name: 'Ballot Not Counted' });
  screen.getByText('Ask a poll worker to restart the scanner.');
});
