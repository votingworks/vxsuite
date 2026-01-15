import { test, beforeEach, afterEach, vi } from 'vitest';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { constructElectionKey, ElectionDefinition } from '@votingworks/types';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '../test/react_testing_library';
import { App } from './app';
import { ApiMock, createApiMock } from '../test/mock_api_client';

let apiMock: ApiMock;
let unmount: () => void = () => {
  throw new Error('unmount was not bound after render');
};

const famousNamesElection: ElectionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  apiMock = createApiMock();
  apiMock.setElection(undefined);
  apiMock.expectGetActiveAnomalies([]);
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
  unmount();
});

function renderApp() {
  ({ unmount } = render(<App apiClient={apiMock.mockApiClient} />));
}

test('renders SetupCardReaderPage when no card reader is detected', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'no_card_reader',
  });
  renderApp();
  await screen.findByText('Card Reader Not Detected');
});

test('renders UnlockMachineScreen when checking PIN', async () => {
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(famousNamesElection.election),
    }),
  });
  renderApp();
  await screen.findByText('Enter Card PIN');
});

test('renders RemoveCardScreen when card needs to be removed', async () => {
  apiMock.setAuthStatus({
    status: 'remove_card',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(famousNamesElection.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  ({ unmount } = render(<App apiClient={apiMock.mockApiClient} />));
  await screen.findByText(/Remove card to unlock/);
});

test('renders MachineLockedScreen when machine is locked - completely unconfigured', async () => {
  apiMock.expectGetDeviceStatuses();
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  renderApp();
  await screen.findByRole('heading', {
    name: 'Insert a system administrator or election manager card to configure VxPollBook',
  });
});

test('renders MachineLockedScreen when machine is locked - configured with election only', async () => {
  apiMock.expectGetDeviceStatuses();
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  apiMock.setElection(famousNamesElection, undefined, 'FAKEHASH');
  renderApp();
  await screen.findByRole('heading', {
    name: 'Insert a system administrator or election manager card to select a precinct',
  });
  await screen.findByText(
    `${famousNamesElection.ballotHash.slice(0, 7)}-FAKEHAS`
  );
});

test('renders MachineLockedScreen when machine is locked - configured with election and precinct', async () => {
  apiMock.expectGetDeviceStatuses();
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  apiMock.setElection(
    famousNamesElection,
    famousNamesElection.election.precincts[0].id,
    'FAKEHASH'
  );
  renderApp();
  await screen.findByText('VxPollBook Locked');
  await screen.findByText('Insert card to unlock');
  await screen.findByText(
    `${famousNamesElection.ballotHash.slice(0, 7)}-FAKEHAS`
  );
});

test('renders InvalidCardScreen for machine_not_configured error', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_not_configured',
  });
  ({ unmount } = render(<App apiClient={apiMock.mockApiClient} />));
  await screen.findByText(
    /Use a system administrator or election manager card./
  );
});

test('renders InvalidCardScreen for invalid card reasons', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'unprogrammed_or_invalid_card',
  });
  ({ unmount } = render(<App apiClient={apiMock.mockApiClient} />));
  await screen.findByText('Use a valid card.');
});

test('election manager - renders UnconfiguredScreen when election is unconfigured and not connected to other machines', async () => {
  apiMock.expectGetDeviceStatuses();
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(famousNamesElection.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  apiMock.setElection(undefined);
  renderApp();
  await screen.findByText(/Configuring/);
});

test('system administrator can unconfigure', async () => {
  apiMock.expectHaveElectionEventsOccurredRepeated(false);
  apiMock.expectAbsenteeModeRepeated(false);

  apiMock.expectGetDeviceStatuses();
  apiMock.authenticateAsSystemAdministrator();
  apiMock.setElection(famousNamesElection);
  renderApp();
  await screen.findByRole('heading', { name: 'Election' });
  screen.getByText('Settings');

  apiMock.expectUnconfigureElection();

  await screen.findByRole('heading', { name: 'Election' });
  const unconfigureButton = await screen.findByRole('button', {
    name: 'Unconfigure Machine',
  });
  userEvent.click(unconfigureButton);

  const confirmButton = await screen.findByRole('button', {
    name: 'Delete All Election Data',
  });
  apiMock.setElection();

  userEvent.click(confirmButton);

  await screen.findByText(
    'Insert a USB drive containing a poll book package or turn on another configured machine.'
  );
});

test('renders ElectionManagerScreen when logged in as election manager', async () => {
  apiMock.expectHaveElectionEventsOccurredRepeated(false);
  apiMock.expectAbsenteeModeRepeated(false);

  apiMock.expectGetDeviceStatuses();
  apiMock.authenticateAsElectionManager(famousNamesElection.election);
  apiMock.setElection(famousNamesElection);
  renderApp();
  await screen.findByText('Voters');
  await screen.findByText('Statistics');

  // We should land on the Election page
  await screen.findByRole('heading', {
    level: 1,
    name: 'Election',
  });

  const electionInfoSection = screen.getByTestId('election-info');
  await within(electionInfoSection).findByText(
    'Lincoln Municipal General Election'
  );
});

test('election manager - unconfigured screen - loading', async () => {
  apiMock.expectGetDeviceStatuses();
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(famousNamesElection.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  apiMock.setElectionConfiguration('loading');
  renderApp();
  await screen.findByText(/Configuring/);
});

test('election manager - unconfigured screen - recently unconfigured', async () => {
  apiMock.expectGetDeviceStatuses();
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(famousNamesElection.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  apiMock.setElectionConfiguration('recently-unconfigured');
  renderApp();
  await screen.findByText('Machine Unconfigured');
});

test('election manager - unconfigured screen - network configuration error', async () => {
  apiMock.expectGetDeviceStatuses();
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(famousNamesElection.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  apiMock.setElectionConfiguration('network-configuration-error');
  render(<App apiClient={apiMock.mockApiClient} />);
  await screen.findByText('Failed to configure VxPollBook');
});

test('election manager - unconfigured screen - network-conflicting-pollbook-packages-match-card', async () => {
  apiMock.expectGetDeviceStatuses();
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(famousNamesElection.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  apiMock.setElectionConfiguration(
    'network-conflicting-pollbook-packages-match-card'
  );
  renderApp();
  await screen.findByText('Conflicting Configurations Detected');
  await screen.findByText(/conflicting configurations/);
});

test('election manager - unconfigured screen - not-found-configuration-matching-election-card', async () => {
  apiMock.expectGetDeviceStatuses();
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(famousNamesElection.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  apiMock.setElectionConfiguration(
    'not-found-configuration-matching-election-card'
  );
  renderApp();
  await screen.findByText('Conflicting Configurations Detected');
  await screen.findByText(/none of them are configured/);
});

test('election manager - unconfigured screen - not-found-network', async () => {
  apiMock.expectGetDeviceStatuses();
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(famousNamesElection.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  apiMock.setElectionConfiguration('not-found-network');
  renderApp();
  await screen.findByText('No Configuration Detected');
  await screen.findByText(/did not detect/);
});
