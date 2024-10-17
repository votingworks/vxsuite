import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { formatElectionHashes } from '@votingworks/types';
import { act, screen, within } from '../../test/react_testing_library';
import { render } from '../../test/test_utils';
import { electionDefinition, election } from '../../test/helpers/election';

import { AdminScreen, AdminScreenProps } from './admin_screen';
import { mockMachineConfig } from '../../test/helpers/mock_machine_config';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2020-10-31T00:00:00.000'));
  window.location.href = '/';
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderScreen(props: Partial<AdminScreenProps> = {}) {
  return render(
    provideApi(
      apiMock,
      <AdminScreen
        ballotsPrintedCount={0}
        electionDefinition={electionDefinition}
        electionPackageHash="test-election-package-hash"
        isTestMode
        unconfigure={jest.fn()}
        machineConfig={mockMachineConfig({
          codeVersion: 'test', // Override default
        })}
        pollsState="polls_open"
        usbDriveStatus={mockUsbDriveStatus('mounted')}
        {...props}
      />
    )
  );
}

test('renders date and time settings modal', async () => {
  // We just do a simple happy path test here, since the libs/ui/set_clock unit
  // tests cover full behavior
  const startDate = 'Sat, Oct 31, 2020, 12:00 AM AKDT';

  renderScreen();
  userEvent.click(await screen.findButton('Set Date and Time'));

  within(screen.getByTestId('modal')).getByText(startDate);

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

test('can switch the precinct', async () => {
  renderScreen();

  apiMock.expectSetPrecinctSelection(ALL_PRECINCTS_SELECTION);
  userEvent.click(await screen.findByText('Select a precinct…'));
  userEvent.click(await screen.findByText('All Precincts'));
});

test('precinct change disabled if polls closed', async () => {
  renderScreen({ pollsState: 'polls_closed_final' });

  const precinctSelect = await screen.findByLabelText('Select a precinct…');
  expect(precinctSelect).toBeDisabled();
});

test('precinct selection absent if single precinct election', async () => {
  renderScreen({
    electionDefinition:
      electionTwoPartyPrimaryFixtures.singlePrecinctElectionDefinition,
  });

  await screen.findByRole('heading', { name: 'Election Manager Menu' });
  expect(screen.queryByLabelText('Select a precinct…')).not.toBeInTheDocument();
});

test('renders a save logs button with no usb ', async () => {
  renderScreen({ usbDriveStatus: mockUsbDriveStatus('no_drive') });
  const saveLogsButton = await screen.findByText('Save Logs');
  userEvent.click(saveLogsButton);
  await screen.findByText('No USB Drive Detected');
});

test('renders a save logs button with usb mounted', async () => {
  renderScreen({ usbDriveStatus: mockUsbDriveStatus('mounted') });
  const saveLogsButton = await screen.findByText('Save Logs');
  userEvent.click(saveLogsButton);
  await screen.findByText('Select a log format:');
});

test('Unconfigure will eject usb', async () => {
  renderScreen({
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });
  const unconfigureButton = await screen.findByText('Unconfigure Machine');
  apiMock.expectEjectUsbDrive();
  userEvent.click(unconfigureButton);
  userEvent.click(screen.getButton('Delete All Election Data'));
});

test('Shows election info', () => {
  renderScreen();
  screen.getByText(election.title);
  screen.getByText(
    formatElectionHashes(
      electionDefinition.ballotHash,
      'test-election-package-hash'
    )
  );
});

test('Shows diagnostics button and renders screen after click', async () => {
  renderScreen();
  apiMock.expectGetElectionRecord(null);
  apiMock.expectGetElectionState();
  apiMock.expectGetApplicationDiskSpaceSummary();
  apiMock.expectGetIsAccessibleControllerInputDetected();
  apiMock.expectGetMostRecentDiagnostic('mark-scan-accessible-controller');
  apiMock.expectGetMostRecentDiagnostic('mark-scan-paper-handler');
  apiMock.expectGetMostRecentDiagnostic('mark-scan-pat-input');
  apiMock.expectGetMostRecentDiagnostic('mark-scan-headphone-input');
  apiMock.expectGetMarkScanBmdModel();

  const diagnosticsButton = await screen.findByText('Diagnostics');
  userEvent.click(diagnosticsButton);
  await screen.findByRole('heading', { name: 'Diagnostics' });
  userEvent.click(screen.getByText('Back'));
  await screen.findByRole('heading', { name: 'Election Manager Menu' });
});

test('switching to official ballot mode with ballots printed', async () => {
  renderScreen({
    ballotsPrintedCount: 1,
    isTestMode: true,
  });

  userEvent.click(screen.getByRole('option', { name: 'Official Ballot Mode' }));
  const modal = await screen.findByRole('alertdialog');

  apiMock.expectSetTestMode(false);
  userEvent.click(within(modal).getButton('Switch to Official Ballot Mode'));
});

test('switching to test ballot mode with ballots printed', async () => {
  renderScreen({
    ballotsPrintedCount: 1,
    isTestMode: false,
  });

  userEvent.click(screen.getByRole('option', { name: 'Test Ballot Mode' }));
  const modal = await screen.findByRole('alertdialog');

  apiMock.expectSetTestMode(true);
  userEvent.click(within(modal).getButton('Switch to Test Ballot Mode'));
});

test('switching to official ballot mode without ballots printed', () => {
  renderScreen({
    ballotsPrintedCount: 0,
    isTestMode: true,
  });

  apiMock.expectSetTestMode(false);
  userEvent.click(screen.getByRole('option', { name: 'Official Ballot Mode' }));
});

test('switching to test ballot mode without ballots printed', () => {
  renderScreen({
    ballotsPrintedCount: 0,
    isTestMode: false,
  });

  apiMock.expectSetTestMode(true);
  userEvent.click(screen.getByRole('option', { name: 'Test Ballot Mode' }));
});
