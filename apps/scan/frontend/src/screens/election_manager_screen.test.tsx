import userEvent from '@testing-library/user-event';
import {
  electionGeneralDefinition,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { mockKiosk } from '@votingworks/test-utils';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { ok } from '@votingworks/basics';
import { mockUsbDriveStatus } from '@votingworks/ui';
import {
  act,
  render,
  RenderResult,
  screen,
  waitFor,
  within,
} from '../../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  provideApi,
  statusNoPaper,
} from '../../test/helpers/mock_api_client';
import {
  ElectionManagerScreen,
  ElectionManagerScreenProps,
} from './election_manager_screen';

let apiMock: ApiMock;

jest.useFakeTimers();

beforeEach(() => {
  window.location.href = '/';
  window.kiosk = mockKiosk();
  apiMock = createApiMock();
  apiMock.expectGetPollsInfo();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.expectGetUsbDriveStatus('mounted');
  apiMock.setPrinterStatusV3({ connected: true });
  apiMock.authenticateAsElectionManager(electionGeneralDefinition);
});

afterEach(() => {
  window.kiosk = undefined;
  apiMock.mockApiClient.assertComplete();
});

function renderScreen(
  props: Partial<ElectionManagerScreenProps> = {}
): RenderResult {
  return render(
    provideApi(
      apiMock,
      <ElectionManagerScreen
        electionDefinition={electionGeneralDefinition}
        scannerStatus={statusNoPaper}
        usbDrive={mockUsbDriveStatus('no_drive')}
        {...props}
      />
    )
  );
}

test('renders date and time settings modal', async () => {
  jest.setSystemTime(new Date('2020-10-31T00:00:00.000'));
  apiMock.expectGetConfig();
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: /system/i }));

  // We just do a simple happy path test here, since the libs/ui/set_clock unit
  // tests cover full behavior
  // Open Modal and change date
  userEvent.click(await screen.findButton('Set Date and Time'));

  within(screen.getByTestId('modal')).getByText(
    'Sat, Oct 31, 2020, 12:00 AM AKDT'
  );

  const selectYear = screen.getByTestId('selectYear');
  const optionYear =
    within(selectYear).getByText<HTMLOptionElement>('2025').value;
  userEvent.selectOptions(selectYear, optionYear);

  // Save Date and Timezone
  apiMock.mockApiClient.setClock
    .expectCallWith({
      isoDatetime: '2025-10-31T00:00:00.000-08:00',
      ianaZone: 'America/Anchorage',
    })
    .resolves();
  apiMock.expectLogOut();
  // eslint-disable-next-line @typescript-eslint/require-await
  await act(async () => {
    userEvent.click(within(screen.getByTestId('modal')).getByText('Save'));
  });
});

test('option to set precinct if more than one', async () => {
  apiMock.expectGetConfig();
  const precinct = electionGeneralDefinition.election.precincts[0];
  const precinctSelection = singlePrecinctSelectionFor(precinct.id);
  renderScreen();

  apiMock.expectSetPrecinct(precinctSelection);
  apiMock.expectGetPollsInfo();
  apiMock.expectGetConfig({ precinctSelection });
  const selectPrecinct = await screen.findByTestId('selectPrecinct');
  userEvent.selectOptions(selectPrecinct, precinct.id);
  await screen.findByDisplayValue(precinct.name);
});

test('no option to change precinct if there is only one precinct', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.singlePrecinctElectionDefinition;
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('precinct-1'),
  });
  renderScreen({ electionDefinition });

  await screen.findByText('Election Manager Settings');
  expect(screen.queryByTestId('selectPrecinct')).not.toBeInTheDocument();
});

test('unconfigure ejects a usb drive', async () => {
  apiMock.expectGetConfig();
  renderScreen({
    scannerStatus: statusNoPaper,
    usbDrive: mockUsbDriveStatus('mounted'),
  });
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: 'Configuration' }));

  apiMock.mockApiClient.unconfigureElection.expectCallWith().resolves();
  apiMock.expectGetConfig({ electionDefinition: undefined });
  apiMock.expectGetPollsInfo();
  apiMock.mockApiClient.ejectUsbDrive.expectCallWith().resolves();
  userEvent.click(screen.getButton('Unconfigure Machine'));
  userEvent.click(screen.getButton('Yes, Delete Election Data'));
  await waitFor(() => {
    apiMock.mockApiClient.assertComplete();
  });
});

test('when sounds are not muted, shows a button to mute sounds', async () => {
  apiMock.expectGetConfig({ isSoundMuted: false });
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  apiMock.mockApiClient.setIsSoundMuted
    .expectCallWith({ isSoundMuted: true })
    .resolves();
  apiMock.expectGetConfig({ isSoundMuted: true });

  userEvent.click(screen.getByRole('tab', { name: /system/i }));

  userEvent.click(screen.getByRole('button', { name: 'Mute Sounds' }));
  await screen.findByRole('button', { name: 'Unmute Sounds' });
});

test('when sounds are muted, shows a button to unmute sounds', async () => {
  apiMock.expectGetConfig({ isSoundMuted: true });
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  apiMock.mockApiClient.setIsSoundMuted
    .expectCallWith({ isSoundMuted: false })
    .resolves();
  apiMock.expectGetConfig({ isSoundMuted: false });

  userEvent.click(screen.getByRole('tab', { name: /system/i }));

  userEvent.click(screen.getByRole('button', { name: 'Unmute Sounds' }));
  await screen.findByRole('button', { name: 'Mute Sounds' });
});

test('shows multi sheet detection toggle', async () => {
  apiMock.expectGetConfig();
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: /system/i }));

  await screen.findByText('Disable Double Sheet Detection');
});

test('prompts to enable multi sheet detection when disabled ', async () => {
  apiMock.expectGetConfig({ isMultiSheetDetectionDisabled: true });
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: /system/i }));

  await screen.findByText('Enable Double Sheet Detection');
});

test('disables multi sheet detection properly', async () => {
  apiMock.expectGetConfig();
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: /system/i }));

  apiMock.mockApiClient.setIsMultiSheetDetectionDisabled
    .expectCallWith({ isMultiSheetDetectionDisabled: true })
    .resolves();
  apiMock.expectGetConfig({ isMultiSheetDetectionDisabled: true });
  userEvent.click(await screen.findButton('Disable Double Sheet Detection'));
  await screen.findButton('Enable Double Sheet Detection');
  await screen.findByText('Enable Double Sheet Detection');
});

test('switching mode when no ballots have been counted', async () => {
  apiMock.expectGetConfig({ isTestMode: true });
  renderScreen({ scannerStatus: { ...statusNoPaper, ballotsCounted: 0 } });
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: 'Configuration' }));

  await screen.findByRole('option', {
    name: 'Test Ballot Mode',
    selected: true,
  });
  const officialBallotModeButton = screen.getByRole('option', {
    name: 'Official Ballot Mode',
    selected: false,
  });

  // Switch from test mode to official mode
  apiMock.expectSetTestMode(false);
  apiMock.expectGetConfig({ isTestMode: false });
  apiMock.expectGetPollsInfo();
  userEvent.click(officialBallotModeButton);
  const testBallotModeButton = await screen.findByRole('option', {
    name: 'Test Ballot Mode',
    selected: false,
  });
  screen.getByRole('option', {
    name: 'Official Ballot Mode',
    selected: true,
  });

  // Switch from official mode to test mode
  apiMock.expectSetTestMode(true);
  apiMock.expectGetConfig({ isTestMode: true });
  apiMock.expectGetPollsInfo();
  userEvent.click(testBallotModeButton);
  await screen.findByRole('option', {
    name: 'Test Ballot Mode',
    selected: true,
  });
  screen.getByRole('option', {
    name: 'Official Ballot Mode',
    selected: false,
  });
});

test('switching to official mode when ballots have been counted', async () => {
  apiMock.expectGetConfig({ isTestMode: true });
  renderScreen({ scannerStatus: { ...statusNoPaper, ballotsCounted: 1 } });
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: 'Configuration' }));

  await screen.findByRole('option', {
    name: 'Test Ballot Mode',
    selected: true,
  });
  const officialBallotModeButton = screen.getByRole('option', {
    name: 'Official Ballot Mode',
    selected: false,
  });

  apiMock.expectSetTestMode(false);
  apiMock.expectGetConfig({ isTestMode: false });
  apiMock.expectGetPollsInfo();
  userEvent.click(officialBallotModeButton);
  await screen.findByRole('option', {
    name: 'Test Ballot Mode',
    selected: false,
  });
  screen.getByRole('option', {
    name: 'Official Ballot Mode',
    selected: true,
  });
});

test('switching to test mode when ballots have been counted', async () => {
  apiMock.expectGetConfig({ isTestMode: false });
  renderScreen({ scannerStatus: { ...statusNoPaper, ballotsCounted: 1 } });
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: 'Configuration' }));

  await screen.findByRole('option', {
    name: 'Test Ballot Mode',
    selected: false,
  });
  let officialBallotModeButton = screen.getByRole('option', {
    name: 'Official Ballot Mode',
    selected: true,
  });

  // Cancel the first time
  userEvent.click(officialBallotModeButton);
  let modal = await screen.findByRole('alertdialog');
  within(modal).getByText(
    'Do you want to switch to test mode and clear the ballots scanned at this scanner?'
  );
  userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  await screen.findByRole('option', {
    name: 'Test Ballot Mode',
    selected: false,
  });
  officialBallotModeButton = screen.getByRole('option', {
    name: 'Official Ballot Mode',
    selected: true,
  });

  // Proceed the second time
  userEvent.click(officialBallotModeButton);
  modal = await screen.findByRole('alertdialog');
  within(modal).getByText(
    'Do you want to switch to test mode and clear the ballots scanned at this scanner?'
  );
  apiMock.expectSetTestMode(true);
  apiMock.expectGetConfig({ isTestMode: true });
  apiMock.expectGetPollsInfo();
  userEvent.click(within(modal).getByRole('button', { name: 'Yes, Switch' }));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  // For some reason, getting by role doesn't work here
  await waitFor(() => {
    expect(
      screen
        .getByText('Test Ballot Mode')
        .closest('button')
        ?.getAttribute('aria-selected')
    ).toEqual('true');
  });
  expect(
    screen
      .getByText('Official Ballot Mode')
      .closest('button')
      ?.getAttribute('aria-selected')
  ).toEqual('false');
});

test('machine cannot be switched to test mode if CVR sync is required', async () => {
  apiMock.mockApiClient.getUsbDriveStatus.reset();
  apiMock.expectGetUsbDriveStatus('mounted', {
    doesUsbDriveRequireCastVoteRecordSync: true,
  });
  apiMock.expectGetConfig({ isTestMode: false });
  renderScreen({ scannerStatus: { ...statusNoPaper, ballotsCounted: 1 } });
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: 'Configuration' }));

  screen.getByText(
    'Cast vote records (CVRs) need to be synced to the inserted USB drive before you can modify the machine configuration. ' +
      'Remove your election manager card to sync.'
  );
  expect(
    screen.getByRole('option', {
      name: 'Test Ballot Mode',
      selected: false,
    })
  ).toBeDisabled();
});

test('machine *can* be switched to official mode, even if CVR sync is required', async () => {
  apiMock.mockApiClient.getUsbDriveStatus.reset();
  apiMock.expectGetUsbDriveStatus('mounted', {
    doesUsbDriveRequireCastVoteRecordSync: true,
  });
  apiMock.expectGetConfig({ isTestMode: true });
  renderScreen({ scannerStatus: { ...statusNoPaper, ballotsCounted: 1 } });
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: 'Configuration' }));

  await screen.findByRole('option', {
    name: 'Test Ballot Mode',
    selected: true,
  });
  const officialBallotModeButton = screen.getByRole('option', {
    name: 'Official Ballot Mode',
    selected: false,
  });

  apiMock.expectSetTestMode(false);
  apiMock.expectGetConfig({ isTestMode: false });
  apiMock.expectGetPollsInfo();
  apiMock.expectGetUsbDriveStatus('mounted');
  userEvent.click(officialBallotModeButton);
  await screen.findByRole('option', {
    name: 'Test Ballot Mode',
    selected: false,
  });
  screen.getByRole('option', {
    name: 'Official Ballot Mode',
    selected: true,
  });
});

test('machine cannot be unconfigured if CVR sync is required and in official mode', async () => {
  apiMock.mockApiClient.getUsbDriveStatus.reset();
  apiMock.expectGetUsbDriveStatus('mounted', {
    doesUsbDriveRequireCastVoteRecordSync: true,
  });
  apiMock.expectGetConfig({ isTestMode: false });
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: 'Configuration' }));

  screen.getByText(
    'Cast vote records (CVRs) need to be synced to the inserted USB drive before you can modify the machine configuration. ' +
      'Remove your election manager card to sync.'
  );
  expect(
    screen.getByRole('button', {
      name: 'Unconfigure Machine',
    })
  ).toBeDisabled();
});

test('machine *can* be unconfigured if CVR sync is required but in test mode', async () => {
  apiMock.mockApiClient.getUsbDriveStatus.reset();
  apiMock.expectGetUsbDriveStatus('mounted', {
    doesUsbDriveRequireCastVoteRecordSync: true,
  });
  apiMock.expectGetConfig({ isTestMode: true });
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: 'Configuration' }));

  expect(
    screen.getByRole('button', {
      name: 'Unconfigure Machine',
    })
  ).toBeEnabled();
});

test('renders buttons for saving logs', async () => {
  apiMock.expectGetConfig();
  renderScreen({
    scannerStatus: statusNoPaper,
    usbDrive: mockUsbDriveStatus('mounted'),
  });
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: 'CVRs and Logs' }));
  await screen.findByRole('heading', { name: 'Election Manager Settings' });
  apiMock.mockApiClient.exportLogsToUsb.expectCallWith().resolves(ok());
  userEvent.click(screen.getByText('Save Log File'));
  userEvent.click(screen.getByText('Save'));
  await screen.findByText('Logs Saved');
});

describe('hardware V4 printer management', () => {
  beforeEach(() => {
    apiMock.mockApiClient.getPrinterStatus.reset();
  });

  test('loading paper for new election happy path', async () => {
    apiMock.expectGetConfig();
    apiMock.setPrinterStatusV4();
    renderScreen({
      scannerStatus: statusNoPaper,
      usbDrive: mockUsbDriveStatus('mounted'),
    });
    await screen.findByRole('heading', { name: 'Election Manager Settings' });

    const tab = screen.getByRole('tab', { name: 'Printer' });
    const [icon] = within(tab).getAllByRole('img', { hidden: true });
    expect(icon).toHaveAttribute('data-icon', 'triangle-exclamation');
    userEvent.click(tab);

    screen.getByText('Must reload paper and test for the current election');
    userEvent.click(screen.getButton('Reload Paper'));

    await screen.findByText('Open Printer');

    apiMock.setPrinterStatusV4({ state: 'cover-open' });
    await screen.findByText('Reload Paper');

    apiMock.setPrinterStatusV4({ state: 'idle' });
    await screen.findByText('Paper Loaded');

    apiMock.expectPrintTestPage();
    userEvent.click(screen.getButton('Continue'));
    await screen.findByText('Test Report Printed');

    apiMock.expectSetHasPaperBeenLoaded(true);
    apiMock.expectGetConfig({ hasPaperBeenLoaded: true });
    userEvent.click(screen.getButton('Finish'));
    await screen.findByText('Printer is loaded and ready');
  });

  test('overriding load paper flow', async () => {
    apiMock.expectGetConfig();
    apiMock.setPrinterStatusV4();
    renderScreen({
      scannerStatus: statusNoPaper,
      usbDrive: mockUsbDriveStatus('mounted'),
    });
    await screen.findByRole('heading', { name: 'Election Manager Settings' });

    userEvent.click(screen.getByRole('tab', { name: 'Printer' }));

    apiMock.expectSetHasPaperBeenLoaded(true);
    apiMock.expectGetConfig({ hasPaperBeenLoaded: true });
    userEvent.click(screen.getButton('Use Current Paper'));

    await screen.findByText('Printer is loaded and ready');
  });
});
