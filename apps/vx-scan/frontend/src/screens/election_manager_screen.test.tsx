import {
  act,
  render,
  RenderResult,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  electionMinimalExhaustiveSampleSinglePrecinctDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { fakeLogger } from '@votingworks/logging';
import { fakeKiosk } from '@votingworks/test-utils';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import MockDate from 'mockdate';
import React from 'react';
import {
  createApiMock,
  provideApi,
  statusNoPaper,
} from '../../test/helpers/mock_api_client';
import { mockUsbDrive } from '../../test/helpers/mock_usb_drive';
import {
  ElectionManagerScreen,
  ElectionManagerScreenProps,
} from './election_manager_screen';

const apiMock = createApiMock();

beforeEach(() => {
  MockDate.set('2020-10-31T00:00:00.000Z');
  jest.useFakeTimers();
  window.location.href = '/';
  window.kiosk = fakeKiosk();
  apiMock.mockApiClient.reset();
  apiMock.expectGetMachineConfig();
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
        usbDrive={mockUsbDrive('absent')}
        logger={fakeLogger()}
        {...props}
      />
    )
  );
}

test('renders date and time settings modal', async () => {
  apiMock.expectGetConfig();
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

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
  apiMock.expectGetConfig();
  renderScreen();

  userEvent.click(await screen.findByText('Save Backup'));
  await screen.findByRole('heading', { name: 'No USB Drive Detected' });
  // Tested in export_backup_modal.test.tsx
});

test('unconfigure does not eject a usb drive that is not mounted', async () => {
  apiMock.expectGetConfig();
  const usbDrive = mockUsbDrive('absent');
  renderScreen({
    scannerStatus: { ...statusNoPaper, canUnconfigure: true },
    usbDrive,
  });
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  apiMock.mockApiClient.unconfigureElection.expectCallWith({}).resolves();
  apiMock.expectGetConfig({ electionDefinition: undefined });
  userEvent.click(screen.getByText('Delete All Election Data from VxScan'));
  userEvent.click(screen.getByText('Yes, Delete All'));
  expect(usbDrive.eject).toHaveBeenCalledTimes(0);
});

test('unconfigure ejects a usb drive when it is mounted', async () => {
  apiMock.expectGetConfig();
  const usbDrive = mockUsbDrive('mounted');
  renderScreen({
    scannerStatus: { ...statusNoPaper, canUnconfigure: true },
    usbDrive,
  });
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  apiMock.mockApiClient.unconfigureElection.expectCallWith({}).resolves();
  apiMock.expectGetConfig({ electionDefinition: undefined });
  userEvent.click(screen.getByText('Delete All Election Data from VxScan'));
  userEvent.click(screen.getByText('Yes, Delete All'));
  await waitFor(() => {
    expect(usbDrive.eject).toHaveBeenCalledTimes(1);
  });
});

test('unconfigure button is disabled when the machine cannot be unconfigured', async () => {
  apiMock.expectGetConfig();
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByText('Delete All Election Data from VxScan'));
  expect(screen.queryByText('Unconfigure Machine?')).toBeNull();
});

test('cannot toggle to testing mode when the machine cannot be unconfigured', async () => {
  apiMock.expectGetConfig({ isTestMode: false });
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  userEvent.click(screen.getByText('Testing Mode'));
  screen.getByText('Save Backup to switch to Test Mode');
  userEvent.click(screen.getByText('Cancel'));
});

test('allows overriding mark thresholds', async () => {
  apiMock.expectGetConfig();
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

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
  apiMock.expectGetConfig({ isSoundMuted: false });
  renderScreen();
  await screen.findByRole('heading', { name: 'Election Manager Settings' });

  apiMock.mockApiClient.setIsSoundMuted
    .expectCallWith({ isSoundMuted: true })
    .resolves();
  apiMock.expectGetConfig({ isSoundMuted: true });
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
  userEvent.click(screen.getByRole('button', { name: 'Unmute Sounds' }));
  await screen.findByRole('button', { name: 'Mute Sounds' });
});
