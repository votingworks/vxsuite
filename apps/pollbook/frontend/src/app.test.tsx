import { test, beforeEach, afterEach, vi } from 'vitest';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { constructElectionKey, Election } from '@votingworks/types';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '../test/react_testing_library';
import { App } from './app';
import { ApiMock, createApiMock } from '../test/mock_api_client';

let apiMock: ApiMock;
const famousNamesElection: Election =
  electionFamousNames2021Fixtures.readElection();

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  apiMock = createApiMock();
  apiMock.setElection(undefined);
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('renders SetupCardReaderPage when no card reader is detected', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'no_card_reader',
  });
  render(<App apiClient={apiMock.mockApiClient} />);
  await screen.findByText('Card Reader Not Detected');
  await screen.findByText('Please connect the card reader to continue.');
});

test('renders UnlockMachineScreen when checking PIN', async () => {
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(famousNamesElection),
    }),
  });
  render(<App apiClient={apiMock.mockApiClient} />);
  await screen.findByText('Enter Card PIN');
});

test('renders RemoveCardScreen when card needs to be removed', async () => {
  apiMock.setAuthStatus({
    status: 'remove_card',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(famousNamesElection),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  render(<App apiClient={apiMock.mockApiClient} />);
  await screen.findByText(/Remove card to unlock/);
});

test('renders MachineLockedScreen when machine is locked', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetDeviceStatuses();
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  render(<App apiClient={apiMock.mockApiClient} />);
  await screen.findByText('VxPollbook Locked');
});

test('renders InvalidCardScreen for invalid card reasons', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'unprogrammed_or_invalid_card',
  });
  render(<App apiClient={apiMock.mockApiClient} />);
  await screen.findByText('Use a valid election manager or poll worker card.');
});

test('election manager - renders UnconfiguredScreen when election is unconfigured and not connected to other machines', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetDeviceStatuses();
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(famousNamesElection),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  apiMock.setElection(undefined);
  render(<App apiClient={apiMock.mockApiClient} />);
  await screen.findByText(/Configuring/);
});

test('system administrator can unconfigure', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetDeviceStatuses();
  apiMock.authenticateAsSystemAdministrator();
  apiMock.setElection(famousNamesElection);
  render(<App apiClient={apiMock.mockApiClient} />);
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

  apiMock.expectGetMachineConfig();
  userEvent.click(confirmButton);

  await screen.findByText(
    'Insert a USB drive containing a pollbook package or power up another configured machine.'
  );
});

test('renders ElectionManagerScreen when logged in as election manager', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetDeviceStatuses();
  apiMock.authenticateAsElectionManager(famousNamesElection);
  apiMock.setElection(famousNamesElection);
  apiMock.setIsAbsenteeMode(false);
  render(<App apiClient={apiMock.mockApiClient} />);
  await screen.findByText('Voters');
  await screen.findByText('Statistics');

  // We should land on the Settings page
  await screen.findByRole('heading', {
    level: 1,
    name: 'Settings',
  });

  const electionInfoSection = screen.getByTestId('election-info');
  await within(electionInfoSection).findByText(
    'Lincoln Municipal General Election'
  );
});

test('renders VendorScreen when logged in as vendor', async () => {
  apiMock.expectGetDeviceStatuses();
  apiMock.authenticateAsVendor();
  render(<App apiClient={apiMock.mockApiClient} />);

  await screen.findByText('Reboot to Vendor Menu');
});

test('election manager - unconfigured screen - loading', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetDeviceStatuses();
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(famousNamesElection),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  apiMock.setElectionConfiguration('loading');
  render(<App apiClient={apiMock.mockApiClient} />);
  await screen.findByText(/Configuring/);
});

test('election manager - unconfigured screen - recently unconfigured', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetDeviceStatuses();
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(famousNamesElection),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  apiMock.setElectionConfiguration('recently-unconfigured');
  render(<App apiClient={apiMock.mockApiClient} />);
  await screen.findByText('Machine Unconfigured');
});

test('election manager - unconfigured screen - network configuration error', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetDeviceStatuses();
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(famousNamesElection),
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
      electionKey: constructElectionKey(famousNamesElection),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  apiMock.setElectionConfiguration(
    'network-conflicting-pollbook-packages-match-card'
  );
  render(<App apiClient={apiMock.mockApiClient} />);
  await screen.findByText('No Valid Configuration Detected');
  await screen.findByText(/conflicting configurations/);
});

test('election manager - unconfigured screen - not-found-configuration-matching-election-card', async () => {
  apiMock.expectGetDeviceStatuses();
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(famousNamesElection),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  apiMock.setElectionConfiguration(
    'not-found-configuration-matching-election-card'
  );
  render(<App apiClient={apiMock.mockApiClient} />);
  await screen.findByText('No Valid Configuration Detected');
  await screen.findByText(/none of them are configured/);
});

test('election manager - unconfigured screen - not-found-network', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetDeviceStatuses();
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(famousNamesElection),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  apiMock.setElectionConfiguration('not-found-network');
  render(<App apiClient={apiMock.mockApiClient} />);
  await screen.findByText('No Configuration Detected');
  await screen.findByText(/did not detect/);
});
