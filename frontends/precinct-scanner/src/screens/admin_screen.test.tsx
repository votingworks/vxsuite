import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { fakeKiosk } from '@votingworks/test-utils';
import { usbstick } from '@votingworks/utils';
import MockDate from 'mockdate';
import React from 'react';
import { AppContext } from '../contexts/app_context';
import { AdminScreen } from './admin_screen';

beforeEach(() => {
  MockDate.set('2020-10-31T00:00:00.000Z');
  jest.useFakeTimers();
  window.location.href = '/';
  window.kiosk = fakeKiosk();
});

afterEach(() => {
  window.kiosk = undefined;
});

test('renders date and time settings modal', async () => {
  render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig: { machineId: '0000', codeVersion: 'TEST' },
        currentUserSession: { type: 'admin', authenticated: true },
      }}
    >
      <AdminScreen
        scannedBallotCount={10}
        isTestMode={false}
        updateAppPrecinctId={jest.fn()}
        toggleLiveMode={jest.fn()}
        unconfigure={jest.fn()}
        calibrate={jest.fn()}
        usbDrive={{ status: usbstick.UsbDriveStatus.absent, eject: jest.fn() }}
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
  const optionYear = (within(selectYear).getByText('2025') as HTMLOptionElement)
    .value;
  fireEvent.change(selectYear, { target: { value: optionYear } });

  // Save Date and Timezone
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
  const updateAppPrecinctId = jest.fn();

  render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig: { machineId: '0000', codeVersion: 'TEST' },
        currentUserSession: { type: 'admin', authenticated: true },
      }}
    >
      <AdminScreen
        scannedBallotCount={10}
        isTestMode={false}
        updateAppPrecinctId={updateAppPrecinctId}
        toggleLiveMode={jest.fn()}
        unconfigure={jest.fn()}
        calibrate={jest.fn()}
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
  expect(updateAppPrecinctId).toHaveBeenNthCalledWith(1, precinct.id);

  // unset precinct
  fireEvent.change(selectPrecinct, {
    target: { value: '' },
  });
  expect(updateAppPrecinctId).toHaveBeenNthCalledWith(2, '');
});

test('export from admin screen', async () => {
  render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig: { machineId: '0000', codeVersion: 'TEST' },
        currentUserSession: { type: 'admin', authenticated: true },
      }}
    >
      <AdminScreen
        scannedBallotCount={10}
        isTestMode={false}
        updateAppPrecinctId={jest.fn()}
        toggleLiveMode={jest.fn()}
        unconfigure={jest.fn()}
        calibrate={jest.fn()}
        usbDrive={{ status: usbstick.UsbDriveStatus.absent, eject: jest.fn() }}
      />
    </AppContext.Provider>
  );

  fireEvent.click(screen.getByText('Export Backup to USB Drive'));
});
