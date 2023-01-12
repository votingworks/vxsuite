import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
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
import { fakeKiosk, Inserted } from '@votingworks/test-utils';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import MockDate from 'mockdate';
import React from 'react';
import {
  createApiMock,
  statusNoPaper,
} from '../../test/helpers/mock_api_client';
import { mockUsbDrive } from '../../test/helpers/mock_usb_drive';
import { renderInAppContext } from '../../test/helpers/render_in_app_context';
import { ApiClientContext, queryClientDefaultOptions } from '../api';
import { AppContextInterface } from '../contexts/app_context';
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
});

afterEach(() => {
  window.kiosk = undefined;
  apiMock.mockApiClient.assertComplete();
});

function renderScreen({
  appContextProps = {},
  electionManagerScreenProps = {},
}: {
  appContextProps?: Partial<AppContextInterface>;
  electionManagerScreenProps?: Partial<ElectionManagerScreenProps>;
} = {}): RenderResult {
  const electionManagerScreenAppContextProps: Partial<AppContextInterface> = {
    auth: Inserted.fakeElectionManagerAuth(),
    ...appContextProps,
  };
  return renderInAppContext(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: queryClientDefaultOptions })}
      >
        <ElectionManagerScreen
          scannerStatus={statusNoPaper}
          isTestMode={false}
          pollsState="polls_closed_initial"
          updatePrecinctSelection={jest.fn()}
          setMarkThresholdOverrides={jest.fn()}
          unconfigure={jest.fn()}
          usbDrive={mockUsbDrive('absent')}
          toggleIsSoundMuted={jest.fn()}
          {...electionManagerScreenProps}
        />
      </QueryClientProvider>
    </ApiClientContext.Provider>,
    electionManagerScreenAppContextProps
  );
}

test('renders date and time settings modal', async () => {
  renderScreen();

  // We just do a simple happy path test here, since the libs/ui/set_clock unit
  // tests cover full behavior
  const startDate = 'Sat, Oct 31, 2020, 12:00 AM UTC';

  // Open Modal and change date
  fireEvent.click(screen.getByText(startDate));

  within(screen.getByTestId('modal')).getByText('Sat, Oct 31, 2020, 12:00 AM');

  const selectYear = screen.getByTestId('selectYear');
  const optionYear =
    within(selectYear).getByText<HTMLOptionElement>('2025').value;
  fireEvent.change(selectYear, { target: { value: optionYear } });

  // Save Date and Timezone
  // eslint-disable-next-line @typescript-eslint/require-await
  await act(async () => {
    fireEvent.click(within(screen.getByTestId('modal')).getByText('Save'));
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
  const updatePrecinctSelection = jest.fn();
  renderScreen({ electionManagerScreenProps: { updatePrecinctSelection } });

  const precinct = electionSampleDefinition.election.precincts[0];
  const selectPrecinct = await screen.findByTestId('selectPrecinct');

  // set precinct
  userEvent.selectOptions(selectPrecinct, precinct.id);
  expect(updatePrecinctSelection).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining(singlePrecinctSelectionFor(precinct.id))
  );
});

test('no option to change precinct if there is only one precinct', async () => {
  renderScreen({
    appContextProps: {
      electionDefinition:
        electionMinimalExhaustiveSampleSinglePrecinctDefinition,
      precinctSelection: singlePrecinctSelectionFor('precinct-1'),
    },
  });

  await screen.findByText('Election Manager Settings');
  expect(screen.queryByTestId('selectPrecinct')).not.toBeInTheDocument();
});

test('export from admin screen', () => {
  renderScreen();

  fireEvent.click(screen.getByText('Save Backup'));
});

test('unconfigure does not eject a usb drive that is not mounted', () => {
  const usbDrive = mockUsbDrive('absent');
  const unconfigureFn = jest.fn();
  renderScreen({
    electionManagerScreenProps: {
      scannerStatus: { ...statusNoPaper, canUnconfigure: true },
      unconfigure: unconfigureFn,
      usbDrive,
    },
  });

  fireEvent.click(screen.getByText('Delete All Election Data from VxScan'));
  fireEvent.click(screen.getByText('Yes, Delete All'));
  expect(unconfigureFn).toHaveBeenCalledTimes(1);
  expect(usbDrive.eject).toHaveBeenCalledTimes(0);
});

test('unconfigure ejects a usb drive when it is mounted', async () => {
  const usbDrive = mockUsbDrive('mounted');
  const unconfigureFn = jest.fn();
  renderScreen({
    electionManagerScreenProps: {
      scannerStatus: { ...statusNoPaper, canUnconfigure: true },
      unconfigure: unconfigureFn,
      usbDrive,
    },
  });

  fireEvent.click(screen.getByText('Delete All Election Data from VxScan'));
  fireEvent.click(screen.getByText('Yes, Delete All'));
  await waitFor(() => {
    expect(unconfigureFn).toHaveBeenCalledTimes(1);
    expect(usbDrive.eject).toHaveBeenCalledTimes(1);
  });
});

test('unconfigure button is disabled when the machine cannot be unconfigured', () => {
  renderScreen();

  fireEvent.click(screen.getByText('Delete All Election Data from VxScan'));
  expect(screen.queryByText('Unconfigure Machine?')).toBeNull();
});

test('cannot toggle to testing mode when the machine cannot be unconfigured', () => {
  renderScreen();

  fireEvent.click(screen.getByText('Testing Mode'));
  screen.getByText('Save Backup to switch to Test Mode');
  fireEvent.click(screen.getByText('Cancel'));
});

test('Allows overriding mark thresholds', async () => {
  const setMarkThresholdOverridesFn = jest.fn();
  renderScreen({
    electionManagerScreenProps: {
      setMarkThresholdOverrides: setMarkThresholdOverridesFn,
    },
  });

  fireEvent.click(screen.getByText('Override Mark Thresholds'));
  fireEvent.click(screen.getByText('Proceed to Override Thresholds'));
  fireEvent.change(screen.getByTestId('definite-text-input'), {
    target: { value: '.5' },
  });
  fireEvent.change(screen.getByTestId('marginal-text-input'), {
    target: { value: '.25' },
  });
  fireEvent.click(screen.getByText('Override Thresholds'));
  expect(setMarkThresholdOverridesFn).toHaveBeenCalledWith({
    definite: 0.5,
    marginal: 0.25,
  });

  await screen.findByText('Override Mark Thresholds');
});
