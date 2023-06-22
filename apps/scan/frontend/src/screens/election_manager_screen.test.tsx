import React from 'react';
import userEvent from '@testing-library/user-event';
import {
  electionMinimalExhaustiveSampleSinglePrecinctDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { fakeLogger } from '@votingworks/logging';
import { fakeKiosk } from '@votingworks/test-utils';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import MockDate from 'mockdate';
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
import { fakeUsbDriveStatus } from '../../test/helpers/fake_usb_drive';

let apiMock: ApiMock;

beforeEach(() => {
  MockDate.set('2020-10-31T00:00:00.000Z');
  jest.useFakeTimers();
  window.location.href = '/';
  window.kiosk = fakeKiosk();
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetScannerStatus(statusNoPaper);
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
        electionDefinition={electionSampleDefinition}
        scannerStatus={statusNoPaper}
        usbDrive={fakeUsbDriveStatus('no_drive')}
        logger={fakeLogger()}
        {...props}
      />
    )
  );
}

test('renders date and time settings modal', async () => {
  apiMock.expectCheckUltrasonicSupported(false);
  apiMock.expectGetConfig();
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: /system/i }));

  // We just do a simple happy path test here, since the libs/ui/set_clock unit
  // tests cover full behavior
  const startDate = 'Sat, Oct 31, 2020, 12:00 AM UTC';

  // Open Modal and change date
  userEvent.click(screen.getByText(startDate));

  within(screen.getByTestId('modal')).getByText('Sat, Oct 31, 2020, 12:00 AM');

  const selectYear = screen.getByTestId('selectYear');
  const optionYear =
    within(selectYear).getByText<HTMLOptionElement>('2025').value;
  userEvent.selectOptions(selectYear, optionYear);

  // Save Date and Timezone
  apiMock.expectLogOut();
  // eslint-disable-next-line @typescript-eslint/require-await
  await act(async () => {
    userEvent.click(within(screen.getByTestId('modal')).getByText('Save'));
  });
  expect(window.kiosk?.setClock).toHaveBeenCalledWith({
    isoDatetime: '2025-10-31T00:00:00.000+00:00',
    // eslint-disable-next-line vx/gts-identifiers
    IANAZone: 'UTC',
  });

  // Date is reset to system time after save to kiosk-browser
  screen.getByText(startDate);
});

test('option to set precinct if more than one', async () => {
  apiMock.expectCheckUltrasonicSupported(false);
  apiMock.expectGetConfig();
  const precinct = electionSampleDefinition.election.precincts[0];
  const precinctSelection = singlePrecinctSelectionFor(precinct.id);
  apiMock.expectSetPrecinct(precinctSelection);
  renderScreen();

  apiMock.expectGetConfig({ precinctSelection });
  const selectPrecinct = await screen.findByTestId('selectPrecinct');
  userEvent.selectOptions(selectPrecinct, precinct.id);
  await screen.findByDisplayValue(precinct.name);
});

test('no option to change precinct if there is only one precinct', async () => {
  apiMock.expectCheckUltrasonicSupported(false);
  const electionDefinition =
    electionMinimalExhaustiveSampleSinglePrecinctDefinition;
  apiMock.expectGetConfig({
    electionDefinition,
    precinctSelection: singlePrecinctSelectionFor('precinct-1'),
  });
  renderScreen({ electionDefinition });

  await screen.findByText('Election Manager Settings');
  expect(screen.queryByTestId('selectPrecinct')).not.toBeInTheDocument();
});

test('export from admin screen', async () => {
  apiMock.expectCheckUltrasonicSupported(false);
  apiMock.expectGetConfig();
  renderScreen();

  userEvent.click(await screen.findByRole('tab', { name: /data/i }));

  userEvent.click(await screen.findByText('Save Backup'));
  await screen.findByRole('heading', { name: 'No USB Drive Detected' });
  // Tested in export_backup_modal.test.tsx
});

test('unconfigure does not eject a usb drive that is not mounted', async () => {
  apiMock.expectCheckUltrasonicSupported(false);
  apiMock.expectGetConfig();
  renderScreen({
    scannerStatus: { ...statusNoPaper, canUnconfigure: true },
    usbDrive: fakeUsbDriveStatus('no_drive'),
  });
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: /data/i }));

  apiMock.mockApiClient.unconfigureElection.expectCallWith({}).resolves();
  apiMock.expectGetConfig({ electionDefinition: undefined });
  userEvent.click(screen.getByText('Delete All Election Data from VxScan'));
  userEvent.click(screen.getByText('Yes, Delete All'));
  // No call to apiClient.ejectUsbDrive should have occurred, which is confirmed
  // by apiMock.mockApiClient.assertComplete
  await waitFor(() => {
    apiMock.mockApiClient.assertComplete();
  });
});

test('unconfigure ejects a usb drive when it is mounted', async () => {
  apiMock.expectCheckUltrasonicSupported(false);
  apiMock.expectGetConfig();
  renderScreen({
    scannerStatus: { ...statusNoPaper, canUnconfigure: true },
    usbDrive: fakeUsbDriveStatus('mounted'),
  });
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: /data/i }));

  apiMock.mockApiClient.unconfigureElection.expectCallWith({}).resolves();
  apiMock.expectGetConfig({ electionDefinition: undefined });
  apiMock.mockApiClient.ejectUsbDrive.expectCallWith().resolves();
  userEvent.click(screen.getByText('Delete All Election Data from VxScan'));
  userEvent.click(screen.getByText('Yes, Delete All'));
  await waitFor(() => {
    apiMock.mockApiClient.assertComplete();
  });
});

test('unconfigure button is disabled when the machine cannot be unconfigured', async () => {
  apiMock.expectCheckUltrasonicSupported(false);
  apiMock.expectGetConfig();
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: /data/i }));

  userEvent.click(screen.getByText('Delete All Election Data from VxScan'));
  expect(screen.queryByText('Unconfigure Machine?')).toBeNull();
});

test('cannot toggle to Test Ballot Mode when the machine cannot be unconfigured', async () => {
  apiMock.expectCheckUltrasonicSupported(false);
  apiMock.expectGetConfig({ isTestMode: false });
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByText('Test Ballot Mode'));
  screen.getByText('Save Backup to switch to Test Ballot Mode');
  userEvent.click(screen.getByText('Cancel'));
});

test('allows overriding mark thresholds', async () => {
  apiMock.expectCheckUltrasonicSupported(false);
  apiMock.expectGetConfig();
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: /system/i }));

  userEvent.click(screen.getByText('Override Mark Thresholds'));
  userEvent.click(screen.getByText('Proceed to Override Thresholds'));
  userEvent.clear(screen.getByTestId('definite-text-input'));
  userEvent.type(screen.getByTestId('definite-text-input'), '.5');
  userEvent.clear(screen.getByTestId('marginal-text-input'));
  userEvent.type(screen.getByTestId('marginal-text-input'), '.25');

  apiMock.expectSetMarkThresholdOverrides({
    definite: 0.5,
    marginal: 0.25,
  });
  apiMock.expectGetConfig({
    markThresholdOverrides: { definite: 0.5, marginal: 0.25 },
  });
  userEvent.click(screen.getByText('Override Thresholds'));
  await screen.findByText('Reset Mark Thresholds');
});

test('when sounds are not muted, shows a button to mute sounds', async () => {
  apiMock.expectCheckUltrasonicSupported(false);
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
  apiMock.expectCheckUltrasonicSupported(false);
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

test('does not show ultrasonic button if not supported', async () => {
  apiMock.expectCheckUltrasonicSupported(false);
  apiMock.expectGetConfig();
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: /system/i }));

  expect(screen.queryByText('Disable Double Sheet Detection')).toBeNull();
});

test('shows ultrasonic toggle when supported', async () => {
  apiMock.expectCheckUltrasonicSupported(true);
  apiMock.expectGetConfig();
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: /system/i }));

  await screen.findByText('Disable Double Sheet Detection');
});

test('prompts to enable ultrasonic when disabled ', async () => {
  apiMock.expectCheckUltrasonicSupported(true);
  apiMock.expectGetConfig({ isUltrasonicDisabled: true });
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: /system/i }));

  await screen.findByText('Enable Double Sheet Detection');
});

test('disables ultrasonic properly', async () => {
  apiMock.expectCheckUltrasonicSupported(true);
  apiMock.expectGetConfig();
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByRole('tab', { name: /system/i }));

  apiMock.mockApiClient.setIsUltrasonicDisabled
    .expectCallWith({ isUltrasonicDisabled: true })
    .resolves();
  apiMock.expectGetConfig({ isUltrasonicDisabled: true });
  userEvent.click(await screen.findButton('Disable Double Sheet Detection'));
  await screen.findButton('Enable Double Sheet Detection');
  await screen.findByText('Enable Double Sheet Detection');
});
