import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { asElectionDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { DEFAULT_SYSTEM_SETTINGS, PollsState } from '@votingworks/types';
import { LocationPicker, LocationPickerProps } from '@votingworks/mark-flow-ui';
import { assertDefined } from '@votingworks/basics';
import { act, screen, within } from '../../test/react_testing_library';
import { render } from '../../test/test_utils';
import { election } from '../../test/helpers/election';

import { AdminScreen, AdminScreenProps } from './admin_screen';
import { mockMachineConfig } from '../../test/helpers/mock_machine_config';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';

vi.mock('@votingworks/mark-flow-ui', async (importActual) => ({
  ...(await importActual()),
  LocationPicker: vi.fn(),
}));
const MOCK_LOCATION_PICKER_ID = 'MockLocationPicker';
const MockLocationPicker = vi.mocked(LocationPicker);

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date('2020-10-31T00:00:00.000'),
  });
  apiMock = createApiMock();

  MockLocationPicker.mockReturnValue(
    <div data-testid={MOCK_LOCATION_PICKER_ID} />
  );
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
        electionDefinition={asElectionDefinition(election)}
        electionPackageHash="test-election-package-hash"
        isTestMode
        unconfigure={vi.fn()}
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

  apiMock.expectGetSystemSettings();
  apiMock.expectGetUsbPortStatus();
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

test('renders system buttons', async () => {
  apiMock.expectGetSystemSettings();
  apiMock.expectGetUsbPortStatus();
  renderScreen();
  await screen.findByText('System');
  screen.getByText('Power Down');
  screen.getByText('Signed Hash Validation');
});

test('wires up location picker', async () => {
  apiMock.expectGetSystemSettings();
  apiMock.expectGetUsbPortStatus();

  const pollsState: PollsState = 'polls_paused';
  const [place1, place2] = assertDefined(election.pollingPlaces);

  renderScreen({ pollingPlaceId: place1.id, pollsState });
  screen.getByTestId(MOCK_LOCATION_PICKER_ID);

  const props = assertDefined(MockLocationPicker.mock.lastCall)[0];
  expect(props).toEqual<LocationPickerProps>({
    election,
    pollsState,
    selectPollingPlace: expect.anything(),
    pollingPlaceId: place1.id,
  });

  const client = apiMock.mockApiClient;
  client.setPollingPlaceId.expectCallWith({ id: place2.id }).resolves();
  await props.selectPollingPlace(place2.id);
  client.assertComplete();
});

test('renders a save logs button with no usb', async () => {
  apiMock.expectGetSystemSettings();
  apiMock.expectGetUsbPortStatus();
  renderScreen({ usbDriveStatus: mockUsbDriveStatus('no_drive') });
  const saveLogsButton = await screen.findByText('Save Logs');
  userEvent.click(saveLogsButton);
  await screen.findByText('No USB Drive Detected');
});

test('renders a save logs button with usb mounted', async () => {
  apiMock.expectGetSystemSettings();
  apiMock.expectGetUsbPortStatus();
  renderScreen({ usbDriveStatus: mockUsbDriveStatus('mounted') });
  const saveLogsButton = await screen.findByText('Save Logs');
  userEvent.click(saveLogsButton);
  await screen.findByText('Select a log format:');
});

test('unconfigure will eject usb', async () => {
  apiMock.expectGetSystemSettings();
  apiMock.expectGetUsbPortStatus();
  renderScreen({
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });
  const unconfigureButton = await screen.findByText('Unconfigure Machine');
  apiMock.expectEjectUsbDrive();
  userEvent.click(unconfigureButton);
  userEvent.click(screen.getButton('Delete All Election Data'));
});

test('shows bubble mark calibration when print mode is marks_on_preprinted_ballot', async () => {
  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    bmdPrintMode: 'marks_on_preprinted_ballot',
  });
  apiMock.expectGetUsbPortStatus();
  renderScreen();

  await screen.findByRole('heading', {
    name: 'Bubble Mark Offset Calibration',
  });
  screen.getByText('X:');
  screen.getByText('Y:');
});

test('does not show bubble mark calibration when print mode is summary', async () => {
  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    bmdPrintMode: 'summary',
  });
  apiMock.expectGetUsbPortStatus();
  renderScreen();

  await screen.findByRole('heading', { name: 'Election Manager Menu' });
  expect(
    screen.queryByRole('heading', { name: 'Bubble Mark Offset Calibration' })
  ).toBeNull();
});

const TEST_DECKS_BUTTON = 'Test Decks';

test('can access test deck functionality when relevant system setting is enabled', async () => {
  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    enableTestDeckPrinting: true,
  });
  apiMock.expectGetUsbPortStatus();
  renderScreen();

  await screen.findByRole('heading', { name: 'Election Manager Menu' });
  screen.getByRole('button', { name: TEST_DECKS_BUTTON });
});

test('cannot access test deck functionality when relevant system setting is disabled', async () => {
  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    enableTestDeckPrinting: false,
  });
  apiMock.expectGetUsbPortStatus();
  renderScreen();

  await screen.findByRole('heading', { name: 'Election Manager Menu' });
  expect(
    screen.queryByRole('button', { name: TEST_DECKS_BUTTON })
  ).not.toBeInTheDocument();
});

test('switching to official ballot mode with ballots printed', async () => {
  apiMock.expectGetSystemSettings();
  apiMock.expectGetUsbPortStatus();
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
  apiMock.expectGetSystemSettings();
  apiMock.expectGetUsbPortStatus();
  renderScreen({
    ballotsPrintedCount: 1,
    isTestMode: false,
  });

  userEvent.click(screen.getByRole('option', { name: 'Test Ballot Mode' }));
  const modal = await screen.findByRole('alertdialog');

  apiMock.expectSetTestMode(true);
  userEvent.click(within(modal).getButton('Switch to Test Ballot Mode'));
});

test('does not show the barcode activation mode toggle when QR ballot activation is disabled', async () => {
  apiMock.expectGetSystemSettings();
  apiMock.expectGetUsbPortStatus();
  renderScreen();

  await screen.findByRole('heading', { name: 'Election Manager Menu' });
  expect(screen.queryByRole('option', { name: 'Voting Session' })).toBeNull();
});

test('toggles the barcode activation mode when QR ballot activation is enabled', async () => {
  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    bmdEnableQrBallotActivation: true,
  });
  apiMock.expectGetUsbPortStatus();
  apiMock.mockApiClient.getBarcodeActivationMode
    .expectCallWith()
    .resolves('voter_session');

  renderScreen();

  const votingSession = await screen.findByRole('option', {
    name: 'Voting Session',
  });
  expect(votingSession).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('option', { name: 'Blank Ballot' })).toHaveAttribute(
    'aria-selected',
    'false'
  );

  apiMock.mockApiClient.setBarcodeActivationMode
    .expectCallWith({ mode: 'ballot_printing' })
    .resolves();
  apiMock.mockApiClient.getBarcodeActivationMode
    .expectCallWith()
    .resolves('ballot_printing');

  userEvent.click(screen.getByRole('option', { name: 'Blank Ballot' }));

  await vi.waitFor(() => {
    expect(
      screen.getByRole('option', { name: 'Blank Ballot' })
    ).toHaveAttribute('aria-selected', 'true');
  });
});

test('switching to official ballot mode without ballots printed', () => {
  apiMock.expectGetSystemSettings();
  apiMock.expectGetUsbPortStatus();
  renderScreen({
    ballotsPrintedCount: 0,
    isTestMode: true,
  });

  apiMock.expectSetTestMode(false);
  userEvent.click(screen.getByRole('option', { name: 'Official Ballot Mode' }));
});

test('switching to test ballot mode without ballots printed', () => {
  apiMock.expectGetSystemSettings();
  apiMock.expectGetUsbPortStatus();
  renderScreen({
    ballotsPrintedCount: 0,
    isTestMode: false,
  });

  apiMock.expectSetTestMode(true);
  userEvent.click(screen.getByRole('option', { name: 'Test Ballot Mode' }));
});

test('navigates to diagnostics screen and back', async () => {
  apiMock.expectGetSystemSettings();
  apiMock.expectGetUsbPortStatus();
  apiMock.expectGetMachineConfig();
  apiMock.mockApiClient.getElectionRecord.expectCallWith().resolves(null);
  apiMock.mockApiClient.getElectionState.expectCallWith().resolves({
    pollsState: 'polls_closed_initial',
    ballotsPrintedCount: 0,
    isTestMode: true,
  });
  apiMock.mockApiClient.getDiskSpaceSummary.mockResolvedValue({
    available: 1_000_000_000,
    used: 1_000_000_000,
    total: 2_000_000_000,
  });
  apiMock.expectGetMostRecentDiagnostic('mark-accessible-controller');
  apiMock.expectGetMostRecentDiagnostic('mark-pat-input');
  apiMock.expectGetMostRecentDiagnostic('mark-headphone-input');
  apiMock.expectGetMostRecentDiagnostic('mark-system-audio');
  apiMock.expectGetMostRecentDiagnostic('mark-barcode-reader');
  apiMock.expectGetMostRecentDiagnostic('uninterruptible-power-supply');
  apiMock.expectGetMostRecentDiagnostic('test-print');

  renderScreen();

  // Navigate to diagnostics
  userEvent.click(await screen.findButton('Diagnostics'));
  await screen.findByRole('heading', { name: 'System Diagnostics' });

  // Navigate back
  userEvent.click(screen.getByRole('button', { name: /back/i }));
  await screen.findByRole('heading', { name: 'Election Manager Menu' });
});

test('unconfigure handles error gracefully', async () => {
  apiMock.expectGetSystemSettings();
  apiMock.expectGetUsbPortStatus();
  renderScreen({
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  const unconfigureButton = await screen.findByText('Unconfigure Machine');
  apiMock.expectEjectUsbDriveToError();

  userEvent.click(unconfigureButton);
  userEvent.click(screen.getButton('Delete All Election Data'));

  // The error should be caught and handled, no crash
  await screen.findByText('Election Manager Menu');
});

test('shows enable USB ports button when USB ports are disabled', async () => {
  apiMock.expectGetSystemSettings();
  apiMock.expectGetUsbPortStatus(false);
  renderScreen();

  await screen.findByRole('button', { name: 'Enable USB Ports' });
});

test('does not show enable USB ports button when USB ports are enabled', async () => {
  apiMock.expectGetSystemSettings();
  apiMock.expectGetUsbPortStatus(true);
  renderScreen();

  await screen.findByRole('heading', { name: 'Election Manager Menu' });
  expect(
    screen.queryByRole('button', { name: 'Enable USB Ports' })
  ).not.toBeInTheDocument();
});
