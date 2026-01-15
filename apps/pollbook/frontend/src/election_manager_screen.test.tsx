import { describe, test, beforeEach, afterEach, vi, expect } from 'vitest';
import {
  electionFamousNames2021Fixtures,
  electionSimpleSinglePrecinctFixtures,
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
import { getMockElectionManagerAuth } from '../test/auth';

let apiMock: ApiMock;
const electionDefFamousNames =
  electionFamousNames2021Fixtures.readElectionDefinition();

const precinct1 = electionDefFamousNames.election.precincts[0].id;

let unmount: () => void;

beforeEach(() => {
  vi.clearAllMocks();
  apiMock = createApiMock();
  apiMock.setAuthStatus(getMockElectionManagerAuth());
  apiMock.setIsAbsenteeMode(false);
  apiMock.setElection(electionDefFamousNames);
  apiMock.expectGetDeviceStatuses();
  apiMock.expectGetActiveAnomalies([]);
  apiMock.expectHaveElectionEventsOccurred(false);
  apiMock.expectGetScannedIdDocument();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
  unmount();
});

describe('Voters tab', () => {
  test('view voter details from voter search', async () => {
    apiMock.setElection(electionDefFamousNames, precinct1);
    const renderResult = renderInAppContext(<ElectionManagerScreen />, {
      apiMock,
    });
    unmount = renderResult.unmount;

    // Election Manager search should include inactive voters
    apiMock.expectSearchVotersNull({});
    userEvent.click(await screen.findButton('Voters'));

    await screen.findByRole('heading', { name: 'Voters' });

    const voter = createMockVoter('123', 'Abigail', 'Adams', precinct1);
    apiMock.expectSearchVotersWithResults(
      {
        firstName: 'ABI',
        lastName: 'AD',
        exactMatch: false,
      },
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

describe('ElectionScreen precinct selection', () => {
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
      /The precinct setting cannot be changed because a voter was checked in or voter information was updated/
    );
  });

  test('does not show precinct select for single precinct election', async () => {
    // Setup election with single precinct
    const singlePrecinctElection =
      electionSimpleSinglePrecinctFixtures.readElectionDefinition();
    apiMock.setElection(
      singlePrecinctElection,
      singlePrecinctElection.election.precincts[0].id
    );
    apiMock.expectGetDeviceStatuses();
    // Render
    const renderResult = renderInAppContext(<ElectionManagerScreen />, {
      apiMock,
    });
    unmount = renderResult.unmount;

    // There should be no select precinct option shown
    await screen.findAllByText('Election');
    const select = screen.queryByLabelText('Select Precinct');
    expect(select).toBeNull();
  });

  test('handles error when setting precinct by disabling', async () => {
    const { precincts } = electionDefFamousNames.election;
    const renderResult = renderInAppContext(<ElectionManagerScreen />, {
      apiMock,
    });
    unmount = renderResult.unmount;

    // Wait for the SearchSelect to appear with the correct value
    const select = await screen.findByLabelText('Select Precinct');
    expect(select).toBeInTheDocument();
    expect((select as HTMLSelectElement).disabled).toBeFalsy();

    apiMock.expectSetConfiguredPrecinct(precincts[1].id, new Error('test'));

    userEvent.click(screen.getByText('Select Precinct…'));
    userEvent.click(screen.getByText(precincts[1].name));

    const selectDisabled = await screen.findByLabelText('Select Precinct');
    expect(selectDisabled).toBeInTheDocument();
    expect((selectDisabled as HTMLSelectElement).disabled).toBeTruthy();
    screen.getByText(
      /The precinct setting cannot be changed because a voter was checked in or voter information was updated/
    );
  });
});

describe('Settings tab', () => {
  beforeEach(() => {
    apiMock.expectGetUsbDriveStatus({
      status: 'mounted',
      mountPoint: '/dev/null',
    });
  });

  async function renderSettingsTab() {
    const renderResult = renderInAppContext(<ElectionManagerScreen />, {
      apiMock,
    });
    unmount = renderResult.unmount;

    const settingsTabButton = await screen.findByRole('button', {
      name: 'Settings',
    });
    userEvent.click(settingsTabButton);

    await screen.findByRole('heading', { name: 'Settings' });
  }

  test('save logs button', async () => {
    await renderSettingsTab();

    // Full functionality tested in libs/ui/src/export_logs_modal.test.tsx
    const saveLogsButton = await screen.findButton('Save Logs');
    userEvent.click(saveLogsButton);
    await screen.findByRole('heading', { name: 'Save Logs' });
    screen.getByText('Select a log format:');
  });

  test('set date and time button', async () => {
    await renderSettingsTab();

    // Full functionality tested in libs/ui/src/set_clock.test.tsx
    userEvent.click(screen.getByRole('button', { name: 'Set Date and Time' }));
    await screen.findByRole('heading', { name: 'Set Date and Time' });
  });

  test('format USB drive button is hidden', async () => {
    await renderSettingsTab();

    await expect
      .poll(() => screen.queryByRole('heading', { name: 'Format USB Drive' }))
      .not.toBeInTheDocument();
  });
});
