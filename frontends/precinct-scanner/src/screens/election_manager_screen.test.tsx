import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Scan } from '@votingworks/api';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { fakeKiosk, Inserted } from '@votingworks/test-utils';
import { singlePrecinctSelectionFor } from '@votingworks/types';
import { usbstick } from '@votingworks/utils';
import MockDate from 'mockdate';
import React from 'react';
import { AppContext } from '../contexts/app_context';
import { ElectionManagerScreen } from './election_manager_screen';

beforeEach(() => {
  MockDate.set('2020-10-31T00:00:00.000Z');
  jest.useFakeTimers();
  window.location.href = '/';
  window.kiosk = fakeKiosk();
});

afterEach(() => {
  window.kiosk = undefined;
});

const auth = Inserted.fakeElectionManagerAuth();

const scannerStatus: Scan.PrecinctScannerStatus = {
  state: 'no_paper',
  ballotsCounted: 0,
  canUnconfigure: false,
};

test('renders date and time settings modal', async () => {
  render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        isSoundMuted: false,
        machineConfig: { machineId: '0000', codeVersion: 'TEST' },
        auth,
      }}
    >
      <ElectionManagerScreen
        scannerStatus={scannerStatus}
        isTestMode={false}
        updatePrecinctSelection={jest.fn()}
        toggleLiveMode={jest.fn()}
        setMarkThresholdOverrides={jest.fn()}
        unconfigure={jest.fn()}
        usbDrive={{ status: usbstick.UsbDriveStatus.absent, eject: jest.fn() }}
        toggleIsSoundMuted={jest.fn()}
      />
    </AppContext.Provider>
  );

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

test('setting and un-setting the precinct', async () => {
  const updatePrecinctSelection = jest.fn();

  render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig: { machineId: '0000', codeVersion: 'TEST' },
        isSoundMuted: false,
        auth,
      }}
    >
      <ElectionManagerScreen
        scannerStatus={scannerStatus}
        isTestMode={false}
        updatePrecinctSelection={updatePrecinctSelection}
        toggleLiveMode={jest.fn()}
        setMarkThresholdOverrides={jest.fn()}
        unconfigure={jest.fn()}
        toggleIsSoundMuted={jest.fn()}
        usbDrive={{ status: usbstick.UsbDriveStatus.absent, eject: jest.fn() }}
      />
    </AppContext.Provider>
  );

  const precinct = electionSampleDefinition.election.precincts[0];
  const selectPrecinct = await screen.findByTestId('selectPrecinct');

  // set precinct
  fireEvent.change(selectPrecinct, {
    target: { value: electionSampleDefinition.election.precincts[0].id },
  });
  expect(updatePrecinctSelection).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining(singlePrecinctSelectionFor(precinct.id))
  );
});

test('export from admin screen', () => {
  render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig: { machineId: '0000', codeVersion: 'TEST' },
        isSoundMuted: false,
        auth,
      }}
    >
      <ElectionManagerScreen
        scannerStatus={scannerStatus}
        isTestMode={false}
        updatePrecinctSelection={jest.fn()}
        toggleLiveMode={jest.fn()}
        setMarkThresholdOverrides={jest.fn()}
        unconfigure={jest.fn()}
        toggleIsSoundMuted={jest.fn()}
        usbDrive={{ status: usbstick.UsbDriveStatus.absent, eject: jest.fn() }}
      />
    </AppContext.Provider>
  );

  fireEvent.click(screen.getByText('Save Backup'));
});

test('unconfigure ejects a usb drive when it is mounted', () => {
  const ejectFn = jest.fn();
  const unconfigureFn = jest.fn();
  render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig: { machineId: '0000', codeVersion: 'TEST' },
        isSoundMuted: false,
        auth,
      }}
    >
      <ElectionManagerScreen
        scannerStatus={{ ...scannerStatus, canUnconfigure: true }}
        isTestMode={false}
        updatePrecinctSelection={jest.fn()}
        toggleLiveMode={jest.fn()}
        setMarkThresholdOverrides={jest.fn()}
        unconfigure={unconfigureFn}
        toggleIsSoundMuted={jest.fn()}
        usbDrive={{ status: usbstick.UsbDriveStatus.absent, eject: ejectFn }}
      />
    </AppContext.Provider>
  );

  fireEvent.click(screen.getByText('Delete All Election Data from VxScan'));
  fireEvent.click(screen.getByText('Yes, Delete All'));
  expect(unconfigureFn).toHaveBeenCalledTimes(1);
  expect(ejectFn).toHaveBeenCalledTimes(0);
});

test('unconfigure does not eject a usb drive that is not mounted', async () => {
  const ejectFn = jest.fn();
  const unconfigureFn = jest.fn();
  render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig: { machineId: '0000', codeVersion: 'TEST' },
        isSoundMuted: false,
        auth,
      }}
    >
      <ElectionManagerScreen
        scannerStatus={{ ...scannerStatus, canUnconfigure: true }}
        isTestMode={false}
        updatePrecinctSelection={jest.fn()}
        toggleLiveMode={jest.fn()}
        setMarkThresholdOverrides={jest.fn()}
        unconfigure={unconfigureFn}
        toggleIsSoundMuted={jest.fn()}
        usbDrive={{ status: usbstick.UsbDriveStatus.mounted, eject: ejectFn }}
      />
    </AppContext.Provider>
  );

  fireEvent.click(screen.getByText('Delete All Election Data from VxScan'));
  fireEvent.click(screen.getByText('Yes, Delete All'));
  await waitFor(() => {
    expect(unconfigureFn).toHaveBeenCalledTimes(1);
    expect(ejectFn).toHaveBeenCalledTimes(1);
  });
});

test('unconfigure button is disabled when the machine cannot be unconfigured', () => {
  render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig: { machineId: '0000', codeVersion: 'TEST' },
        isSoundMuted: false,
        auth,
      }}
    >
      <ElectionManagerScreen
        scannerStatus={scannerStatus}
        isTestMode={false}
        updatePrecinctSelection={jest.fn()}
        toggleLiveMode={jest.fn()}
        setMarkThresholdOverrides={jest.fn()}
        unconfigure={jest.fn()}
        toggleIsSoundMuted={jest.fn()}
        usbDrive={{ status: usbstick.UsbDriveStatus.mounted, eject: jest.fn() }}
      />
    </AppContext.Provider>
  );

  fireEvent.click(screen.getByText('Delete All Election Data from VxScan'));
  expect(screen.queryByText('Unconfigure Machine?')).toBeNull();
});

test('cannot toggle to testing mode when the machine cannot be unconfigured', () => {
  const toggleLiveModeFn = jest.fn();

  render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig: { machineId: '0000', codeVersion: 'TEST' },
        isSoundMuted: false,
        auth,
      }}
    >
      <ElectionManagerScreen
        scannerStatus={scannerStatus}
        isTestMode={false}
        updatePrecinctSelection={jest.fn()}
        toggleLiveMode={toggleLiveModeFn}
        setMarkThresholdOverrides={jest.fn()}
        unconfigure={jest.fn()}
        toggleIsSoundMuted={jest.fn()}
        usbDrive={{ status: usbstick.UsbDriveStatus.mounted, eject: jest.fn() }}
      />
    </AppContext.Provider>
  );

  fireEvent.click(screen.getByText('Testing Mode'));
  expect(toggleLiveModeFn).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Cancel'));
});

test('Allows overriding mark thresholds', async () => {
  const setMarkThresholdOverridesFn = jest.fn();

  render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        isSoundMuted: false,
        machineConfig: { machineId: '0000', codeVersion: 'TEST' },
        auth,
      }}
    >
      <ElectionManagerScreen
        scannerStatus={scannerStatus}
        isTestMode={false}
        updatePrecinctSelection={jest.fn()}
        toggleLiveMode={jest.fn()}
        setMarkThresholdOverrides={setMarkThresholdOverridesFn}
        unconfigure={jest.fn()}
        toggleIsSoundMuted={jest.fn()}
        usbDrive={{ status: usbstick.UsbDriveStatus.mounted, eject: jest.fn() }}
      />
    </AppContext.Provider>
  );

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
