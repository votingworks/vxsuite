import { test, beforeEach, afterEach, vi, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { constructElectionKey, Election } from '@votingworks/types';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { render, screen, within } from '../test/react_testing_library';
import { App } from './app';
import {
  ApiMock,
  createApiMock,
  createMockVoter,
} from '../test/mock_api_client';

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

test('renders PollWorkerScreen when logged in as poll worker basic e2e check in flow works', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetDeviceStatuses();
  apiMock.authenticateAsPollWorker(famousNamesElection);
  apiMock.setElection(famousNamesElection);
  render(<App apiClient={apiMock.mockApiClient} />);
  await screen.findByText('Connect printer to continue.');

  apiMock.setPrinterStatus(true);
  apiMock.setIsAbsenteeMode(false);
  apiMock.expectGetCheckInCounts({ allMachines: 25, thisMachine: 5 });
  await screen.findByText('Check-In');
  await screen.findByText('Registration');
  apiMock.expectSearchVotersNull({});

  await screen.findByText('Total Check-ins');
  const total = screen.getByTestId('total-check-ins');
  within(total).getByText('25');
  const machine = screen.getByTestId('machine-check-ins');
  within(machine).getByText('5');

  apiMock.expectSearchVotersTooMany({ firstName: '', lastName: 'SM' }, 153);
  const lastNameInput = screen.getByLabelText('Last Name');
  userEvent.type(lastNameInput, 'SM');
  vi.advanceTimersByTime(1000);
  await screen.findByText(
    'Voters matched: 153. Refine your search further to view results.'
  );

  const voter = createMockVoter('123', 'Abigail', 'Adams');

  apiMock.expectSearchVotersWithResults({ firstName: 'ABI', lastName: 'AD' }, [
    voter,
  ]);
  userEvent.clear(lastNameInput);
  userEvent.type(lastNameInput, 'AD');
  const firstNameInput = screen.getByLabelText('First Name');
  userEvent.type(firstNameInput, 'ABI');
  vi.advanceTimersByTime(1000);
  await screen.findByText(/Adams, Abigail/i);
  const checkInButton = screen.getByTestId('check-in-button#123');
  within(checkInButton).getByText('Start Check-In');

  apiMock.expectGetVoter(voter);
  userEvent.click(checkInButton);
  await screen.findByText('Confirm Voter Identity');

  const confirmButton = screen.getByText('Confirm Check-In');
  apiMock.expectCheckInVoter(voter);
  userEvent.click(confirmButton);
  await screen.findByText('Voter Checked In');
});
