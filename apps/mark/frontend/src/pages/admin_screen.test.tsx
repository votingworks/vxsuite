import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  asElectionDefinition,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_SELECTION,
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { screen, within } from '../../test/react_testing_library';
import { render } from '../../test/test_utils';
import { election, defaultPrecinctId } from '../../test/helpers/election';

import { AdminScreen, AdminScreenProps } from './admin_screen';
import { mockMachineConfig } from '../../test/helpers/mock_machine_config';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';

const featureFlagMock = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date('2020-10-31T00:00:00.000'),
  });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
  featureFlagMock.resetFeatureFlags();
});

function renderScreen(props: Partial<AdminScreenProps> = {}) {
  return render(
    provideApi(
      apiMock,
      <AdminScreen
        appPrecinct={singlePrecinctSelectionFor(defaultPrecinctId)}
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
  apiMock.expectGetSystemSettings();
  renderScreen();

  // We just do a simple happy path test here, since the libs/ui/set_clock unit
  // tests cover full behavior
  const startDate = 'Sat, Oct 31, 2020, 12:00 AM AKDT';
  await screen.findByText(startDate);

  // Open Modal and change date
  userEvent.click(screen.getButton('Set Date and Time'));

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

  userEvent.click(within(screen.getByTestId('modal')).getByText('Save'));

  // Date is reset to system time after save
  await screen.findByText(startDate);
});

test('renders system buttons', async () => {
  apiMock.expectGetSystemSettings();
  renderScreen();
  await screen.findByText('System');
  screen.getByText('Power Down');
  screen.getByText('Signed Hash Validation');
});

test('can switch the precinct', () => {
  apiMock.expectGetSystemSettings();
  renderScreen();

  apiMock.expectSetPrecinctSelection(ALL_PRECINCTS_SELECTION);
  userEvent.click(screen.getByLabelText('Select a precinct…'));
  userEvent.click(screen.getByText('All Precincts'));
});

test('precinct change disabled if polls closed', () => {
  apiMock.expectGetSystemSettings();
  renderScreen({ pollsState: 'polls_closed_final' });

  const precinctSelect = screen.getByLabelText('Select a precinct…');
  expect(precinctSelect).toBeDisabled();
});

test('precinct selection disabled if single precinct election', async () => {
  apiMock.expectGetSystemSettings();
  renderScreen({
    electionDefinition:
      electionTwoPartyPrimaryFixtures.makeSinglePrecinctElectionDefinition(),
    appPrecinct: singlePrecinctSelectionFor('precinct-1'),
  });

  await screen.findByRole('heading', { name: 'Election Manager Settings' });
  expect(screen.getByLabelText('Select a precinct…')).toBeDisabled();
  screen.getByText(
    'Precinct cannot be changed because there is only one precinct configured for this election.'
  );
});

test('renders a save logs button with no usb', async () => {
  apiMock.expectGetSystemSettings();
  renderScreen({ usbDriveStatus: mockUsbDriveStatus('no_drive') });
  const saveLogsButton = await screen.findByText('Save Logs');
  userEvent.click(saveLogsButton);
  await screen.findByText('No USB Drive Detected');
});

test('renders a save logs button with usb mounted', async () => {
  apiMock.expectGetSystemSettings();
  renderScreen({ usbDriveStatus: mockUsbDriveStatus('mounted') });
  const saveLogsButton = await screen.findByText('Save Logs');
  userEvent.click(saveLogsButton);
  await screen.findByText('Select a log format:');
});

test('renders a USB controller button', async () => {
  apiMock.expectGetSystemSettings();
  renderScreen({ usbDriveStatus: mockUsbDriveStatus('no_drive') });
  await screen.findByText('No USB');

  apiMock.expectGetSystemSettings();
  renderScreen({ usbDriveStatus: mockUsbDriveStatus('mounted') });
  await screen.findByText('Eject USB');
});

test('USB button calls eject', async () => {
  apiMock.expectGetSystemSettings();
  renderScreen({ usbDriveStatus: mockUsbDriveStatus('mounted') });
  const ejectButton = await screen.findByText('Eject USB');
  apiMock.expectEjectUsbDrive();
  userEvent.click(ejectButton);
});

test('shows bubble mark calibration when print mode is marks_on_preprinted_ballot', async () => {
  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    bmdPrintMode: 'marks_on_preprinted_ballot',
  });
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
  renderScreen();

  await screen.findByRole('heading', { name: 'Election Manager Settings' });
  expect(
    screen.queryByRole('heading', { name: 'Bubble Mark Offset Calibration' })
  ).toBeNull();
});
