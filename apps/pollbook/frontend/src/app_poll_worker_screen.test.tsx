import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Election, ElectionDefinition } from '@votingworks/types';
import {
  electionFamousNames2021Fixtures,
  electionSimpleSinglePrecinctFixtures,
  readMultiPartyPrimaryElection,
  readMultiPartyPrimaryElectionDefinition,
} from '@votingworks/fixtures';
import {
  AamvaDocument,
  Voter,
  VoterCheckInError,
  VoterSearchParams,
} from '@votingworks/pollbook-backend';
import { act, render, screen, within } from '../test/react_testing_library';
import { App } from './app';
import {
  ApiMock,
  createApiMock,
  createMockVoter,
} from '../test/mock_api_client';
import { AUTOMATIC_FLOW_STATE_RESET_DELAY_MS } from './globals';
import { DEFAULT_QUERY_REFETCH_INTERVAL } from './api';

let apiMock: ApiMock;
const famousNamesElection: Election =
  electionFamousNames2021Fixtures.readElection();
const famousNamesElectionDefinition: ElectionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();
const precinct1 = famousNamesElection.precincts[0].id;

const singlePrecinctElectionDefinition: ElectionDefinition =
  electionSimpleSinglePrecinctFixtures.readElectionDefinition();
const singlePrecinct = singlePrecinctElectionDefinition.election.precincts[0];

const multiPartyPrimaryElectionDefinition: ElectionDefinition =
  readMultiPartyPrimaryElectionDefinition();
const multiPartyPrimaryElection: Election = readMultiPartyPrimaryElection();
const primaryPrecinct = multiPartyPrimaryElection.precincts[0];

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

  test('basic e2e check in flow works for general election', async () => {
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
    apiMock.expectGetScannedIdDocument();
    apiMock.expectSearchVotersNull({});

    await vi.waitFor(() => screen.getByText('Total Check-ins'));
    const total = screen.getByTestId('total-check-ins');
    within(total).getByText('25');
    const machine = screen.getByTestId('machine-check-ins');
    within(machine).getByText('5');

    apiMock.expectSearchVotersTooMany({ firstName: '', lastName: 'SM' }, 153);
    const lastNameInput = screen.getByLabelText('Last Name');
    userEvent.type(lastNameInput, 'SM');
    act(() => {
      vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL);
    });
    await screen.findByText(
      'Voters matched: 153. Refine your search further to view results.'
    );

    const voter = createMockVoter('123', 'Abigail', 'Adams', precinct1);
    const voterWrongPrecinct = createMockVoter(
      '124',
      'Abigail',
      'Addams',
      famousNamesElection.precincts[1].id
    );

    apiMock.expectSearchVotersWithResults(
      { firstName: 'ABI', lastName: 'AD' },
      [voter, voterWrongPrecinct]
    );
    userEvent.clear(lastNameInput);
    userEvent.type(lastNameInput, 'AD');
    const firstNameInput = screen.getByLabelText('First Name');
    userEvent.type(firstNameInput, 'ABI');
    act(() => {
      vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL);
    });
    const firstRow = await screen.findByTestId('voter-row#123');
    within(firstRow).getByText(/Adams, Abigail/i);
    within(firstRow).getByText(
      new RegExp(famousNamesElection.precincts[0].name, 'i')
    );
    const secondRow = await screen.findByTestId('voter-row#124');
    within(secondRow).getByText(/Addams, Abigail/i);
    within(secondRow).getByText(
      new RegExp(famousNamesElection.precincts[1].name, 'i')
    );
    const checkInButton = screen.getByTestId('check-in-button#123');
    const checkInButtonWrongPrecinct = screen.getByTestId(
      'check-in-button#124'
    );
    within(checkInButton).getByText('Start Check-In');
    within(checkInButtonWrongPrecinct).getByText('View Details');

    apiMock.expectGetVoter(voter);
    userEvent.click(checkInButton);
    await screen.findByText('Confirm Voter Identity');

    const confirmButton = screen.getByText('Confirm Check-In');
    apiMock.expectCheckInVoter(voter, voter.party);
    apiMock.expectGetVoter(voter);
    userEvent.click(confirmButton);
    await screen.findByText('Voter Checked In');

    apiMock.expectSearchVotersWithResults({ firstName: '', lastName: '' }, []);
    act(() => {
      vi.advanceTimersByTime(AUTOMATIC_FLOW_STATE_RESET_DELAY_MS);
    });
    expect(screen.queryByText('Voter Checked In')).toBeNull();

    unmount();
  });

  test.skip('primary election e2e flow with party selection', async () => {
    apiMock.expectGetDeviceStatuses();
    apiMock.authenticateAsPollWorker(multiPartyPrimaryElection);
    apiMock.setElection(multiPartyPrimaryElectionDefinition);
    const { unmount } = render(<App apiClient={apiMock.mockApiClient} />);
    await screen.findByText('Connect printer to continue.');

    apiMock.setPrinterStatus(true);
    apiMock.setIsAbsenteeMode(false);
    await screen.findByText('No Precinct Selected');

    apiMock.setElection(
      multiPartyPrimaryElectionDefinition,
      multiPartyPrimaryElection.precincts[0].id
    );

    apiMock.expectGetCheckInCounts({ allMachines: 25, thisMachine: 5 });
    await vi.waitFor(() => {
      screen.getByText('Check-In');
    });
    apiMock.expectGetScannedIdDocument();
    apiMock.expectSearchVotersNull({});

    await screen.findByText('Total Check-ins');
    const total = screen.getByTestId('total-check-ins');
    within(total).getByText('25');
    const machine = screen.getByTestId('machine-check-ins');
    within(machine).getByText('5');

    apiMock.expectSearchVotersTooMany({ firstName: '', lastName: 'SM' }, 153);
    const lastNameInput = screen.getByLabelText('Last Name');
    userEvent.type(lastNameInput, 'SM');
    act(() => {
      vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL);
    });
    await screen.findByText(
      'Voters matched: 153. Refine your search further to view results.'
    );

    const voter = createMockVoter(
      '123',
      'Abigail',
      'Adams',
      primaryPrecinct.id
    );
    const voterWrongPrecinct = createMockVoter(
      '124',
      'Abigail',
      'Addams',
      multiPartyPrimaryElection.precincts[1].id
    );

    apiMock.expectSearchVotersWithResults(
      { firstName: 'ABI', lastName: 'AD' },
      [voter, voterWrongPrecinct]
    );
    userEvent.clear(lastNameInput);
    userEvent.type(lastNameInput, 'AD');
    const firstNameInput = screen.getByLabelText('First Name');
    userEvent.type(firstNameInput, 'ABI');
    act(() => {
      vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL);
    });
    const firstRow = await screen.findByTestId('voter-row#123');
    within(firstRow).getByText(/Adams, Abigail/i);
    within(firstRow).getByText(
      new RegExp(multiPartyPrimaryElection.precincts[0].name, 'i')
    );
    const checkInButton = screen.getByTestId('check-in-button#123');
    const checkInButtonWrongPrecinct = screen.getByTestId(
      'check-in-button#124'
    );
    within(checkInButton).getByText('Start Check-In');
    within(checkInButtonWrongPrecinct).getByText('View Details');

    apiMock.expectGetVoter(voter);
    userEvent.click(checkInButton);
    await screen.findByRole('heading', { name: 'Confirm Voter Identity' });

    const confirmIdentityButton = screen.getButton('Confirm Identity');
    userEvent.click(confirmIdentityButton);

    await screen.findByRole('heading', { name: 'Select Party' });

    // Test back button
    userEvent.click(screen.getButton('Back'));
    await screen.findByRole('heading', { name: 'Confirm Voter Identity' });
    userEvent.click(screen.getButton('Confirm Identity'));

    const confirmCheckInButton = screen.getButton('Confirm Check-In');
    expect(confirmCheckInButton).toBeDisabled();
    userEvent.click(screen.getButton('Democratic'));
    expect(confirmCheckInButton).not.toBeDisabled();

    apiMock.expectCheckInVoter(voter, 'DEM');
    apiMock.expectGetVoter(voter);
    userEvent.click(confirmCheckInButton);
    await screen.findByText('Voter Checked In');

    apiMock.expectSearchVotersWithResults({ firstName: '', lastName: '' }, []);
    act(() => {
      vi.advanceTimersByTime(AUTOMATIC_FLOW_STATE_RESET_DELAY_MS);
    });
    expect(screen.queryByText('Voter Checked In')).toBeNull();

    unmount();
  });

  test('single precinct election does not show precinct name', async () => {
    apiMock.expectGetDeviceStatuses();
    apiMock.authenticateAsPollWorker(singlePrecinctElectionDefinition.election);
    apiMock.setElection(singlePrecinctElectionDefinition, singlePrecinct.id);
    apiMock.setPrinterStatus(true);
    apiMock.setIsAbsenteeMode(false);
    apiMock.expectGetScannedIdDocument();
    apiMock.expectSearchVotersNull({});
    apiMock.expectGetCheckInCounts({ allMachines: 25, thisMachine: 5 });
    const { unmount } = render(<App apiClient={apiMock.mockApiClient} />);

    await vi.waitFor(() => screen.getByText('Total Check-ins'));
    const total = screen.getByTestId('total-check-ins');
    within(total).getByText('25');
    const machine = screen.getByTestId('machine-check-ins');
    within(machine).getByText('5');

    const voter = createMockVoter('123', 'Abigail', 'Adams', singlePrecinct.id);

    apiMock.expectSearchVotersWithResults(
      { firstName: 'ABI', lastName: 'AD' },
      [voter]
    );
    const lastNameInput = screen.getByLabelText('Last Name');
    userEvent.clear(lastNameInput);
    userEvent.type(lastNameInput, 'AD');
    const firstNameInput = screen.getByLabelText('First Name');
    userEvent.type(firstNameInput, 'ABI');
    act(() => {
      vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL);
    });
    const firstRow = await screen.findByTestId('voter-row#123');
    within(firstRow).getByText(/Adams, Abigail/i);

    expect(
      within(firstRow).queryByText(new RegExp(singlePrecinct.name, 'i'))
    ).toBeNull();

    unmount();
  });

  test('exactly 1 match for barcode scan navigates to check in screen', async () => {
    apiMock.authenticateAsPollWorker(famousNamesElection);
    apiMock.setElection(famousNamesElectionDefinition);
    apiMock.setPrinterStatus(true);
    apiMock.setIsAbsenteeMode(false);
    apiMock.setElection(
      famousNamesElectionDefinition,
      famousNamesElection.precincts[0].id
    );
    apiMock.expectGetCheckInCounts({ allMachines: 25, thisMachine: 5 });
    apiMock.expectGetScannedIdDocument();
    apiMock.expectSearchVotersNull({});

    // Render empty voter search screen
    const { unmount } = render(<App apiClient={apiMock.mockApiClient} />);
    await vi.waitFor(() => screen.getByText('Voter Check-In'));

    const document: AamvaDocument = {
      firstName: 'Aaron',
      middleName: 'Danger',
      lastName: 'Burr',
      nameSuffix: 'Jr',
      issuingJurisdiction: 'NH',
    };
    const searchParams: VoterSearchParams = {
      firstName: document.firstName,
      middleName: document.middleName,
      lastName: document.lastName,
      suffix: document.nameSuffix,
      exactMatch: true,
    };
    const mockVoter: Voter = {
      ...createMockVoter(
        '123',
        document.firstName,
        document.lastName,
        precinct1
      ),
      middleName: document.middleName,
      suffix: document.nameSuffix,
    };

    // API returns a new barcode scan so we expect search and the getVoter endpoint
    // to be queried with the new voter
    apiMock.expectGetScannedIdDocument(document);
    apiMock.expectSearchVotersWithResults(searchParams, [mockVoter]);
    apiMock.expectGetVoter(mockVoter);

    act(() => {
      vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL);
    });

    // Expect voter check-in screen to be rendered
    await screen.findByRole('heading', { name: 'Confirm Voter Identity' });

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
      apiMock.setElection(famousNamesElectionDefinition, precinct1);
      const { unmount } = render(<App apiClient={apiMock.mockApiClient} />);
      await screen.findByText('Connect printer to continue.');

      apiMock.setPrinterStatus(true);
      apiMock.setIsAbsenteeMode(false);
      apiMock.expectGetCheckInCounts({ allMachines: 25, thisMachine: 5 });
      apiMock.expectSearchVotersNull({});
      apiMock.expectGetScannedIdDocument();

      await vi.waitFor(async () => await screen.findByText('Total Check-ins'));
      const total = screen.getByTestId('total-check-ins');
      within(total).getByText('25');
      const machine = screen.getByTestId('machine-check-ins');
      within(machine).getByText('5');

      apiMock.expectSearchVotersTooMany({ firstName: '', lastName: 'SM' }, 153);
      const lastNameInput = screen.getByLabelText('Last Name');
      userEvent.type(lastNameInput, 'SM');
      act(() => {
        vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL);
      });
      await screen.findByText(
        'Voters matched: 153. Refine your search further to view results.'
      );

      const voter = createMockVoter('123', 'Abigail', 'Adams', precinct1);

      apiMock.expectSearchVotersWithResults(
        { firstName: 'ABI', lastName: 'AD' },
        [voter]
      );
      userEvent.clear(lastNameInput);
      userEvent.type(lastNameInput, 'AD');
      const firstNameInput = screen.getByLabelText('First Name');
      userEvent.type(firstNameInput, 'ABI');
      act(() => {
        vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL);
      });
      await screen.findByText(/Adams, Abigail/i);
      const checkInButton = screen.getByTestId('check-in-button#123');
      within(checkInButton).getByText('Start Check-In');

      apiMock.expectGetVoter(voter);
      userEvent.click(checkInButton);
      await screen.findByText('Confirm Voter Identity');

      const confirmButton = screen.getByText('Confirm Check-In');
      apiMock.expectCheckInVoterError(voter, testCase.error, voter.party);
      userEvent.click(confirmButton);
      await screen.findByText(testCase.expectedMessage);

      unmount();
    });
  }
});
