import { test, beforeEach, afterEach, vi, expect } from 'vitest';
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

test('renders UnconfiguredScreen when election is unconfigured', async () => {
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
  await screen.findByText('Insert a USB drive containing a pollbook package');
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

  await screen.findByText('Insert a USB drive containing a pollbook package');
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

  // We should land on the Settings page so the text should be present twice
  expect(await screen.findAllByText('Settings')).toHaveLength(2);

  const electionInfoSection = screen.getByTestId('election-info');
  await within(electionInfoSection).findByText(
    'Lincoln Municipal General Election'
  );
});
