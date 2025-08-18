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
import { screen, waitFor, within } from '../../test/react_testing_library';
import { render } from '../../test/test_utils';
import { election, defaultPrecinctId } from '../../test/helpers/election';

import {
  ElectionManagerScreen,
  ElectionManagerScreenProps,
} from './election_manager_screen';
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

function renderScreen(props: Partial<ElectionManagerScreenProps> = {}) {
  apiMock.mockApiClient.getPrintMode.reset();
  apiMock.mockApiClient.getPrintMode.expectCallWith().resolves('bubble_marks');

  return render(
    provideApi(
      apiMock,
      <ElectionManagerScreen
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
  renderScreen();

  // We just do a simple happy path test here, since the libs/ui/set_clock unit
  // tests cover full behavior
  const startDate = 'Sat, Oct 31, 2020, 12:00 AM AKDT';

  // Open Modal and change date
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

  userEvent.click(within(screen.getByTestId('modal')).getByText('Save'));

  await waitFor(() => {
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });
});

test('can switch the precinct', () => {
  renderScreen();

  apiMock.expectSetPrecinctSelection(ALL_PRECINCTS_SELECTION);
  userEvent.click(screen.getByLabelText('Select a precinct…'));
  userEvent.click(screen.getByText('All Precincts'));
});

test('precinct change disabled if polls closed', () => {
  renderScreen({ pollsState: 'polls_closed_final' });

  const precinctSelect = screen.getByLabelText('Select a precinct…');
  expect(precinctSelect).toBeDisabled();
});

test('precinct selection not present if single precinct election', async () => {
  renderScreen({
    electionDefinition:
      electionTwoPartyPrimaryFixtures.makeSinglePrecinctElectionDefinition(),
    appPrecinct: singlePrecinctSelectionFor('precinct-1'),
  });

  await screen.findByRole('heading', { name: 'Election Manager Menu' });
  expect(screen.queryByLabelText('Select a precinct…')).not.toBeInTheDocument();
});

test('renders a save logs button with no usb', async () => {
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

test('print mode toggle - hidden without feature flag', () => {
  renderScreen({ usbDriveStatus: mockUsbDriveStatus('mounted') });
  expect(screen.queryButton('Bubble Marks')).not.toBeInTheDocument();
});

test('print mode toggle - persists to server', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.MARK_ENABLE_BALLOT_PRINT_MODE_TOGGLE
  );

  renderScreen({ usbDriveStatus: mockUsbDriveStatus('mounted') });
  await screen.findByRole('option', { selected: true, name: 'Bubble Marks' });

  apiMock.mockApiClient.setPrintMode
    .expectCallWith({ mode: 'summary' })
    .resolves();
  apiMock.mockApiClient.getPrintMode.expectCallWith().resolves('summary');

  userEvent.click(
    screen.getByRole('option', { selected: false, name: 'Summary' })
  );

  await screen.findByRole('option', { selected: true, name: 'Summary' });
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
