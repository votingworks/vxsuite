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
  const { getByText, getByTestId } = render(
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

  const startDate = 'Sat, Oct 31, 2020, 12:00 AM UTC';
  getByText(startDate);

  // Open Modal and change date
  fireEvent.click(getByText(startDate));

  within(getByTestId('modal')).getByText('Sat, Oct 31, 2020, 12:00 AM');

  const selectYear = getByTestId('selectYear');
  const optionYear = (within(selectYear).getByText('2025') as HTMLOptionElement)
    .value;
  fireEvent.change(selectYear, { target: { value: optionYear } });

  const selectMonth = getByTestId('selectMonth');
  const optionMonth = (within(selectMonth).getByText(
    'Feb'
  ) as HTMLOptionElement).value;
  fireEvent.change(selectMonth, { target: { value: optionMonth } });

  // Expect day to change because Feb doesn't have 31 days.
  within(getByTestId('modal')).getByText('Fri, Feb 28, 2025, 12:00 AM');

  const selectDay = getByTestId('selectDay');
  const optionDay = (within(selectDay).getByText('3') as HTMLOptionElement)
    .value;
  fireEvent.change(selectDay, { target: { value: optionDay } });

  const selectHour = getByTestId('selectHour');
  const optionHour = (within(selectHour).getByText('11') as HTMLOptionElement)
    .value;
  fireEvent.change(selectHour, { target: { value: optionHour } });

  const selectMinute = getByTestId('selectMinute');
  const optionMinute = (within(selectMinute).getByText(
    '21'
  ) as HTMLOptionElement).value;
  fireEvent.change(selectMinute, { target: { value: optionMinute } });

  const selectMeridian = getByTestId('selectMeridian');
  const optionMeridian = (within(selectMeridian).getByText(
    'PM'
  ) as HTMLOptionElement).value;
  fireEvent.change(selectMeridian, { target: { value: optionMeridian } });

  // Expect day, hour, minute, and meridian to update
  within(getByTestId('modal')).getByText('Mon, Feb 3, 2025, 11:21 PM');

  const selectTimezone = getByTestId('selectTimezone') as HTMLSelectElement;
  const optionTimezone = within(selectTimezone).getByText(
    'Central Standard Time (Chicago)'
  ) as HTMLOptionElement;
  expect(optionTimezone.selected).toBeFalsy();
  fireEvent.change(selectTimezone, { target: { value: optionTimezone.value } });

  expect(selectTimezone.value).toBe('America/Chicago');
  expect(
    (within(selectTimezone).getByText(
      'Central Standard Time (Chicago)'
    ) as HTMLOptionElement).selected
  ).toBeTruthy();

  getByText('Mon, Feb 3, 2025, 11:21 PM');

  // Cancel date change
  fireEvent.click(within(getByTestId('modal')).getByText('Cancel'));
  getByText(startDate);
  expect(window.kiosk?.setClock).not.toHaveBeenCalled();

  // Open Modal and change date again
  fireEvent.click(getByText(startDate));

  const selectDay2 = getByTestId('selectDay');
  const optionDay2 = (within(selectDay2).getByText('21') as HTMLOptionElement)
    .value;
  fireEvent.change(selectDay2, { target: { value: optionDay2 } });

  // Choose PM, then change hours
  const selectMeridian2 = getByTestId('selectMeridian');
  const optionMeridian2 = (within(selectMeridian2).getByText(
    'PM'
  ) as HTMLOptionElement).value;
  fireEvent.change(selectMeridian2, { target: { value: optionMeridian2 } });

  const selectHour2 = getByTestId('selectHour');
  const optionHour2 = (within(selectHour2).getByText('11') as HTMLOptionElement)
    .value;
  fireEvent.change(selectHour2, { target: { value: optionHour2 } });

  // Expect time to be in PM
  screen.getByText('Wed, Oct 21, 2020, 11:00 PM');

  // Choose AM, then change hours
  const selectMeridian3 = getByTestId('selectMeridian');
  const optionMeridian3 = (within(selectMeridian3).getByText(
    'AM'
  ) as HTMLOptionElement).value;
  fireEvent.change(selectMeridian3, { target: { value: optionMeridian3 } });

  // Expect time to be in AM
  screen.getByText('Wed, Oct 21, 2020, 11:00 AM');

  const selectTimezone2 = getByTestId('selectTimezone') as HTMLSelectElement;
  const optionTimezone2 = within(selectTimezone2).getByText(
    'Pacific Daylight Time (Los Angeles)'
  ) as HTMLOptionElement;
  expect(optionTimezone2.selected).toBeFalsy();
  fireEvent.change(selectTimezone2, {
    target: { value: optionTimezone2.value },
  });

  screen.getByText('Wed, Oct 21, 2020, 11:00 AM');

  // Save Date and Timezone
  await act(async () => {
    fireEvent.click(within(getByTestId('modal')).getByText('Save'));
  });
  expect(window.kiosk?.setClock).toHaveBeenCalled();

  // Date is reset to system time after save to kiosk-browser
  getByText(startDate);
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
