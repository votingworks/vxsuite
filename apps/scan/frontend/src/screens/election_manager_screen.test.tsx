import userEvent from '@testing-library/user-event';
import {
  electionGeneralDefinition,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { mockKiosk } from '@votingworks/test-utils';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { ok } from '@votingworks/basics';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { FujitsuPrinterStatus } from '@votingworks/scan-backend';
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
import { RELOAD_REMINDER_TEXT } from '../components/printer_management/election_manager_printer_tab_content';

let apiMock: ApiMock;

jest.useFakeTimers();

beforeEach(() => {
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
  userEvent.click(await screen.findByLabelText('Select a precinct…'));
  userEvent.click(screen.getByText(precinct.name));
  await waitFor(() => {
    // Once in the precinct select, once in the election info bar
    expect(screen.getAllByText(precinct.name)).toHaveLength(2);
  });
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
  expect(screen.queryByLabelText('Select a precinct…')).not.toBeInTheDocument();
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
  apiMock.expectGetMachineConfig();
  apiMock.expectGetConfig({ electionDefinition: undefined });
  apiMock.expectGetPollsInfo();
  apiMock.mockApiClient.ejectUsbDrive.expectCallWith().resolves();
  userEvent.click(screen.getButton('Unconfigure Machine'));
  userEvent.click(screen.getButton('Delete All Election Data'));
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

test('shows double feed detection toggle', async () => {
  apiMock.expectGetConfig();
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: /system/i }));

  await screen.findByText('Disable Double Sheet Detection');
});

test('prompts to enable double feed detection when disabled ', async () => {
  apiMock.expectGetConfig({ isDoubleFeedDetectionDisabled: true });
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: /system/i }));

  await screen.findByText('Enable Double Sheet Detection');
});

test('disables double feed detection properly', async () => {
  apiMock.expectGetConfig();
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: /system/i }));

  apiMock.mockApiClient.setIsDoubleFeedDetectionDisabled
    .expectCallWith({ isDoubleFeedDetectionDisabled: true })
    .resolves();
  apiMock.expectGetConfig({ isDoubleFeedDetectionDisabled: true });
  userEvent.click(await screen.findButton('Disable Double Sheet Detection'));
  await screen.findButton('Enable Double Sheet Detection');
  await screen.findByText('Enable Double Sheet Detection');
});

test('when continuous export is enabled, shows a button to pause continuous export', async () => {
  apiMock.expectGetConfig({ isContinuousExportEnabled: true });
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: 'CVRs and Logs' }));

  apiMock.mockApiClient.setIsContinuousExportEnabled
    .expectCallWith({ isContinuousExportEnabled: false })
    .resolves();
  apiMock.expectGetConfig({ isContinuousExportEnabled: false });

  userEvent.click(
    screen.getByRole('button', { name: 'Pause Continuous CVR Export' })
  );
  await screen.findByRole('button', { name: 'Resume Continuous CVR Export' });
});

test('when continuous export is paused, shows a button to resume continuous export', async () => {
  apiMock.expectGetConfig({ isContinuousExportEnabled: false });
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: 'CVRs and Logs' }));

  apiMock.mockApiClient.setIsContinuousExportEnabled
    .expectCallWith({ isContinuousExportEnabled: true })
    .resolves();
  apiMock.expectGetConfig({ isContinuousExportEnabled: true });

  userEvent.click(
    screen.getByRole('button', { name: 'Resume Continuous CVR Export' })
  );
  await screen.findByRole('button', { name: 'Pause Continuous CVR Export' });
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
  apiMock.mockApiClient.exportLogsToUsb
    .expectCallWith({ format: 'vxf' })
    .resolves(ok());
  userEvent.click(screen.getByText('Save Logs'));
  userEvent.click(screen.getByText('Save'));
  await screen.findByText('Logs Saved');
});

test('shows diagnostics button for hardware v4 and renders screen after click', async () => {
  apiMock.expectGetConfig();
  apiMock.setPrinterStatusV4({ state: 'no-paper' });
  apiMock.expectGetDiskSpaceSummary();
  apiMock.expectGetMostRecentScannerDiagnostic();
  apiMock.expectGetMostRecentPrinterDiagnostic();
  apiMock.expectGetMostRecentAudioDiagnostic();
  renderScreen({
    scannerStatus: statusNoPaper,
    usbDrive: mockUsbDriveStatus('mounted'),
  });

  await screen.findByRole('heading', { name: 'Election Manager Settings' });
  userEvent.click(screen.getByRole('tab', { name: 'System Settings' }));
  await screen.findByRole('heading', { name: 'Election Manager Settings' });
  userEvent.click(screen.getByText('Diagnostics'));
  await screen.findByRole('heading', { name: 'System Diagnostics' });
  userEvent.click(screen.getByText('Back'));
  await screen.findByRole('heading', { name: 'Election Manager Settings' });
});

test('no diagnostics button shown for hardware v3', async () => {
  apiMock.expectGetConfig();
  renderScreen({
    scannerStatus: statusNoPaper,
    usbDrive: mockUsbDriveStatus('mounted'),
  });

  await screen.findByRole('heading', { name: 'Election Manager Settings' });
  userEvent.click(screen.getByRole('tab', { name: 'System Settings' }));
  await screen.findByRole('heading', { name: 'Election Manager Settings' });
  expect(screen.queryByText('Diagnostics')).not.toBeInTheDocument();
});

describe('hardware V4 printer management', () => {
  test('loading paper + printing test page', async () => {
    apiMock.expectGetConfig();
    apiMock.setPrinterStatusV4({ state: 'no-paper' });
    renderScreen({
      scannerStatus: statusNoPaper,
      usbDrive: mockUsbDriveStatus('mounted'),
    });
    await screen.findByRole('heading', { name: 'Election Manager Settings' });

    const tab = await screen.findByRole('tab', { name: 'Printer' });
    const [icon] = within(tab).getAllByRole('img', { hidden: true });
    expect(icon).toHaveAttribute('data-icon', 'triangle-exclamation');
    userEvent.click(tab);

    screen.getByText('The printer is not loaded with paper');

    // load paper flow
    userEvent.click(screen.getButton('Load Paper'));
    await screen.findByRole('alertdialog');
    screen.getByText('Remove Paper Roll Holder');
    apiMock.setPrinterStatusV4({ state: 'cover-open' });
    await screen.findByText('Load New Paper Roll');
    apiMock.setPrinterStatusV4({ state: 'idle' });
    await screen.findByText('Paper Loaded');
    userEvent.click(screen.getButton('Cancel'));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    // happiest path is to print a test page directly from the loading paper flow,
    // but that's tested elsewhere and this is also a valid flow

    // print test page flow
    const testPrint = apiMock.expectPrintTestPage();
    userEvent.click(await screen.findButton('Print Test Page'));
    await screen.findByText('Printing');
    testPrint.resolve();
    await screen.findByText('Test Page Printed');
    apiMock.expectLogTestPrintOutcome('pass');
    userEvent.click(screen.getButton('Yes'));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    screen.getByText('The printer is loaded with paper');
    screen.getByText(RELOAD_REMINDER_TEXT);
  });

  test.each<{
    status: FujitsuPrinterStatus;
    message: string;
  }>([
    {
      status: { state: 'error', type: 'disconnected' },
      message: 'The printer is disconnected',
    },
    {
      status: { state: 'error', type: 'hardware' },
      message: 'The printer encountered an error',
    },
    {
      status: { state: 'cover-open' },
      message: 'The paper roll holder is not attached to the printer',
    },
  ])(
    'uncommon printer status message - $message',
    async ({ status, message }) => {
      apiMock.expectGetConfig();
      apiMock.setPrinterStatusV4(status);
      renderScreen({
        scannerStatus: statusNoPaper,
        usbDrive: mockUsbDriveStatus('mounted'),
      });
      await screen.findByRole('heading', { name: 'Election Manager Settings' });

      const tab = await screen.findByRole('tab', { name: 'Printer' });
      userEvent.click(tab);

      screen.getByText(message);
    }
  );
});
