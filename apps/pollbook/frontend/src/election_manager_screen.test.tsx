import { describe, test, beforeEach, afterEach, vi, expect } from 'vitest';
import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireHudsonFixtures,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { screen } from '../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  createMockVoter,
} from '../test/mock_api_client';
import { renderInAppContext } from '../test/render_in_app_context';
import { ElectionManagerScreen } from './election_manager_screen';

let apiMock: ApiMock;
const electionDefFamousNames =
  electionFamousNames2021Fixtures.readElectionDefinition();

let unmount: () => void;

beforeEach(() => {
  vi.clearAllMocks();
  apiMock = createApiMock();
  apiMock.setIsAbsenteeMode(false);
  apiMock.setElection(electionDefFamousNames);
  apiMock.expectGetDeviceStatuses();
  apiMock.expectHaveElectionEventsOccurred(false);
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
  unmount();
});

describe('Voters tab', () => {
  test('view voter details from voter search', async () => {
    const renderResult = renderInAppContext(<ElectionManagerScreen />, {
      apiMock,
    });
    unmount = renderResult.unmount;

    // Election Manager search should include inactive voters
    apiMock.expectSearchVotersNull({ includeInactiveVoters: true });
    userEvent.click(await screen.findButton('Voters'));

    await screen.findByRole('heading', { name: 'Voters' });

    const voter = createMockVoter('123', 'Abigail', 'Adams');
    apiMock.expectSearchVotersWithResults(
      { firstName: 'ABI', lastName: 'AD', includeInactiveVoters: true },
      [voter]
    );

    const lastNameInput = screen.getByLabelText('Last Name');
    userEvent.clear(lastNameInput);
    userEvent.type(lastNameInput, 'AD');
    const firstNameInput = screen.getByLabelText('First Name');
    userEvent.type(firstNameInput, 'ABI');

    await screen.findByText(/Adams, Abigail/i);

    apiMock.expectGetVoter(voter);
    userEvent.click(screen.getButton('View Details'));

    await screen.findByRole('heading', { name: 'Voter Details' });
  });
});

describe('SettingsScreen precinct selection', () => {
  test('shows precinct select and allows changing configured precinct', async () => {
    // Setup election with multiple precincts
    const { precincts } = electionDefFamousNames.election;
    // Render
    const renderResult = renderInAppContext(<ElectionManagerScreen />, {
      apiMock,
    });
    unmount = renderResult.unmount;

    // Wait for the SearchSelect to appear with the correct value
    const select = await screen.findByLabelText('Select Precinct');
    expect(select).toBeInTheDocument();
    expect(select.ariaDisabled).toBeFalsy();
    // Should have the correct initial value
    expect((select as HTMLSelectElement).value).toEqual('');

    // Simulate changing the precinct
    const newPrecinctId = precincts[1].id;

    apiMock.expectSetConfiguredPrecinct(newPrecinctId);

    userEvent.click(screen.getByText('Select Precinct…'));
    userEvent.click(screen.getByText(precincts[1].name));

    // Wait for the value to update
    await vi.waitFor(() => {
      screen.getByText(precincts[1].name);
    });
  });

  test('does not allow changing precinct once events have occurred', async () => {
    // Setup election with multiple precincts
    apiMock.expectHaveElectionEventsOccurred(true);
    // Render
    const renderResult = renderInAppContext(<ElectionManagerScreen />, {
      apiMock,
    });
    unmount = renderResult.unmount;

    // Wait for the SearchSelect to appear with the correct value
    const select = await screen.findByLabelText('Select Precinct');
    expect(select).toBeInTheDocument();
    expect((select as HTMLSelectElement).disabled).toBeTruthy();
    screen.getByText(
      /The precinct setting cannot be changed because a voter was checked-in or voter data was updated/
    );
  });

  test('does not show precinct select for single precinct election', () => {
    // Setup election with multiple precincts
    const singlePrecinctElection =
      electionGridLayoutNewHampshireHudsonFixtures.readElectionDefinition();
    apiMock.setElection(singlePrecinctElection);
    apiMock.expectGetDeviceStatuses();
    // Render
    const renderResult = renderInAppContext(<ElectionManagerScreen />, {
      apiMock,
    });
    unmount = renderResult.unmount;

    // There should be no select precinct option shown
    const select = screen.queryByLabelText('Select Precinct');
    expect(select).toBeNull();
  });
});
