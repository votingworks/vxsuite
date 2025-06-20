import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Election, ElectionDefinition } from '@votingworks/types';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { VoterCheckInError } from '@votingworks/pollbook-backend';
import { act, render, screen, within } from '../test/react_testing_library';
import { App } from './app';
import {
  ApiMock,
  createApiMock,
  createMockVoter,
} from '../test/mock_api_client';
import { AUTOMATIC_FLOW_STATE_RESET_DELAY_MS } from './globals';

let apiMock: ApiMock;
const famousNamesElection: Election =
  electionFamousNames2021Fixtures.readElection();
const famousNamesElectionDefinition: ElectionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();

describe('PollWorkerScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
    apiMock = createApiMock();
    apiMock.setElection(undefined);
  });

  afterEach(() => {
    apiMock.mockApiClient.assertComplete();
  });

  test('basic e2e check in flow works', async () => {
    apiMock.expectGetDeviceStatuses();
    apiMock.authenticateAsPollWorker(famousNamesElection);
    apiMock.setElection(famousNamesElectionDefinition);
    const { unmount } = render(<App apiClient={apiMock.mockApiClient} />);
    await screen.findByText('Connect printer to continue.');

    apiMock.setPrinterStatus(true);
    apiMock.setIsAbsenteeMode(false);
    await screen.findByText('No Precinct Selected');

    apiMock.setElection(
      famousNamesElectionDefinition,
      famousNamesElection.precincts[0].id
    );
    apiMock.expectGetCheckInCounts({ allMachines: 25, thisMachine: 5 });
    await vi.waitFor(() => {
      screen.getByText('Check-In');
    });
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

    apiMock.expectSearchVotersWithResults(
      { firstName: 'ABI', lastName: 'AD' },
      [voter]
    );
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

    apiMock.expectSearchVotersWithResults({ firstName: '', lastName: '' }, []);
    act(() => {
      vi.advanceTimersByTime(AUTOMATIC_FLOW_STATE_RESET_DELAY_MS);
    });
    expect(screen.queryByText('Voter Checked In')).toBeNull();

    unmount();
  });

  for (const testCase of [
    {
      error: 'already_checked_in' as VoterCheckInError,
      expectedMessage: 'Voter Already Checked In',
    },
  ]) {
    test(`check in flow handles ${testCase.error} error path`, async () => {
      apiMock.expectGetDeviceStatuses();
      apiMock.authenticateAsPollWorker(famousNamesElection);
      apiMock.setElection(
        famousNamesElectionDefinition,
        famousNamesElection.precincts[0].id
      );
      const { unmount } = render(<App apiClient={apiMock.mockApiClient} />);
      await screen.findByText('Connect printer to continue.');

      apiMock.setPrinterStatus(true);
      apiMock.setIsAbsenteeMode(false);
      apiMock.expectGetCheckInCounts({ allMachines: 25, thisMachine: 5 });
      await screen.findByText('Check-In');
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

      apiMock.expectSearchVotersWithResults(
        { firstName: 'ABI', lastName: 'AD' },
        [voter]
      );
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
      apiMock.expectCheckInVoterError(voter, testCase.error);
      userEvent.click(confirmButton);
      await screen.findByText(testCase.expectedMessage);

      unmount();
    });
  }
});
