import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Election } from '@votingworks/types';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  ValidStreetInfo,
  VoterRegistrationRequest,
} from '@votingworks/pollbook-backend';
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
    apiMock.expectGetMachineConfig();
    apiMock.expectGetDeviceStatuses();
    apiMock.authenticateAsPollWorker(famousNamesElection);
    apiMock.setElection(famousNamesElection);
    const { unmount } = render(<App apiClient={apiMock.mockApiClient} />);
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

  test('basic e2e registration flow works', async () => {
    const validStreetInfo: ValidStreetInfo = {
      streetName: 'Main St',
      side: 'even',
      lowRange: 1000,
      highRange: 2000,
      postalCity: 'CITYVILLE',
      zip5: '12345',
      zip4: '6789',
      district: 'District',
    };
    const voter = createMockVoter('123', 'Abigail', 'Adams');
    const registrationData: VoterRegistrationRequest = {
      streetNumber: '1000',
      streetName: 'MAIN ST',
      city: 'CITYVILLE',
      state: 'NH',
      zipCode: '12345',
      lastName: voter.lastName.toUpperCase(),
      firstName: voter.firstName.toUpperCase(),
      party: 'REP',
      streetSuffix: '',
      apartmentUnitNumber: '',
      houseFractionNumber: '',
      addressLine2: '',
      addressLine3: '',
      suffix: '',
      middleName: '',
    };

    apiMock.expectGetMachineConfig();
    apiMock.expectGetDeviceStatuses();
    apiMock.authenticateAsPollWorker(famousNamesElection);
    apiMock.setElection(famousNamesElection);
    const { unmount } = render(<App apiClient={apiMock.mockApiClient} />);
    await screen.findByText('Connect printer to continue.');

    apiMock.setPrinterStatus(true);
    apiMock.expectGetValidStreetInfo([validStreetInfo]);
    await screen.findByText('Check-In');
    await screen.findByText('Registration');

    await screen.findByText('Check-In');
    const registrationTab = await screen.findByRole('button', {
      name: 'Registration',
    });
    userEvent.click(registrationTab);

    const lastNameInput = await screen.findByLabelText('Last Name');
    userEvent.type(lastNameInput, voter.lastName);
    const firstNameInput = screen.getByLabelText('First Name');
    userEvent.type(firstNameInput, voter.firstName);
    userEvent.type(screen.getByLabelText('Street Number'), '1000');
    userEvent.click(screen.getByLabelText('Street Name'));
    userEvent.keyboard('[Enter]');
    userEvent.click(screen.getByLabelText('Party Affiliation'));
    userEvent.keyboard('[Enter]');

    apiMock.expectRegisterVoter(registrationData, voter);

    userEvent.click(screen.getByRole('button', { name: 'Add Voter' }));

    await screen.findByText('Give the voter their receipt.');
    act(() => {
      vi.advanceTimersByTime(AUTOMATIC_FLOW_STATE_RESET_DELAY_MS);
    });
    expect(screen.queryByText('Give the voter their receipt.')).toBeNull();

    unmount();
  });
});
