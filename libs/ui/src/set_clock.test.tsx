import { DateTime } from 'luxon';
import fc from 'fast-check';
import { arbitraryDateTime } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import {
  act,
  cleanup,
  screen,
  waitFor,
  within,
} from '../test/react_testing_library';
import {
  PickDateTimeModal,
  MAX_YEAR,
  MIN_YEAR,
  SetClockButton,
  CurrentDateAndTime,
} from './set_clock';
import { newTestContext } from '../test/test_context';

function getSelect(testId: string): HTMLSelectElement {
  return screen.getByTestId(testId);
}

const aDate = DateTime.fromObject(
  {
    year: 2021,
    month: 3,
    day: 31,
    hour: 19,
    minute: 34,
    second: 56,
  },
  { zone: 'America/Los_Angeles' }
);

const { mockApiClient, render } = newTestContext({ skipUiStringsApi: true });

describe('PickDateTimeModal', () => {
  test('shows pickers for the datetime parts of the given time', () => {
    const onCancel = jest.fn();
    const onSave = jest.fn();
    render(
      <PickDateTimeModal
        onCancel={onCancel}
        onSave={onSave}
        saveLabel="Save"
        value={aDate}
      />
    );

    expect(getSelect('selectYear').value).toEqual('2021');
    expect(getSelect('selectMonth').value).toEqual('3');
    expect(getSelect('selectDay').value).toEqual('31');
    expect(getSelect('selectHour').value).toEqual('7');
    expect(getSelect('selectMinute').value).toEqual('34');
    expect(getSelect('selectMeridian').value).toEqual('PM');
    expect(getSelect('selectTimezone').value).toEqual('America/Los_Angeles');
  });

  test('calls back with the new date on save', () => {
    const onCancel = jest.fn();
    const onSave = jest.fn();
    render(
      <PickDateTimeModal
        onCancel={onCancel}
        onSave={onSave}
        saveLabel="Save"
        value={aDate}
      />
    );

    expect(onSave).not.toHaveBeenCalled();
    userEvent.click(screen.getByText('Save'));

    // No changes yet, expect the same date
    expect(onSave).toHaveBeenNthCalledWith(1, aDate);

    // Make a change & save
    const changedDay = 20;
    userEvent.selectOptions(getSelect('selectDay'), changedDay.toString());
    userEvent.click(screen.getByText('Save'));

    // Expect a changed date
    expect(onSave).toHaveBeenNthCalledWith(
      2,
      aDate.set({ day: changedDay, second: 0 })
    );

    // Make a timezone change & save
    userEvent.selectOptions(getSelect('selectTimezone'), 'America/Chicago');
    userEvent.click(screen.getByText('Save'));

    // Expect a changed timezone
    expect(onSave).toHaveBeenNthCalledWith(
      3,
      DateTime.fromObject(
        {
          year: aDate.year,
          month: aDate.month,
          day: changedDay,
          hour: aDate.hour,
          minute: aDate.minute,
          second: 0,
        },
        { zone: 'America/Chicago' }
      )
    );
  });

  test('calls back on cancel', () => {
    const onCancel = jest.fn();
    const onSave = jest.fn();
    render(
      <PickDateTimeModal
        onCancel={onCancel}
        onSave={onSave}
        saveLabel="Save"
        value={aDate}
      />
    );

    expect(onCancel).not.toHaveBeenCalled();
    userEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('can set any valid date & time', () => {
    fc.assert(
      fc.property(
        arbitraryDateTime({
          minYear: MIN_YEAR,
          maxYear: MAX_YEAR,
          zoneName: aDate.zoneName,
        }).map((dateTime) => dateTime.set({ second: 0 })),
        (dateTime) => {
          cleanup();

          const onCancel = jest.fn();
          const onSave = jest.fn();
          render(
            <PickDateTimeModal
              onCancel={onCancel}
              onSave={onSave}
              saveLabel="Save"
              value={aDate}
            />
          );

          expect(onSave).not.toHaveBeenCalled();

          // Make a change & save
          userEvent.selectOptions(
            getSelect('selectYear'),
            dateTime.year.toString()
          );
          userEvent.selectOptions(
            getSelect('selectMonth'),
            dateTime.month.toString()
          );
          userEvent.selectOptions(
            getSelect('selectDay'),
            dateTime.day.toString()
          );
          userEvent.selectOptions(
            getSelect('selectHour'),
            (dateTime.hour > 12
              ? dateTime.hour % 12
              : dateTime.hour === 0
              ? 12
              : dateTime.hour
            ).toString()
          );
          userEvent.selectOptions(
            getSelect('selectMinute'),
            dateTime.minute.toString()
          );
          userEvent.selectOptions(
            getSelect('selectMeridian'),
            dateTime.hour < 12 ? 'AM' : 'PM'
          );
          userEvent.click(screen.getByText('Save'));

          // Expect a changed date
          expect(onSave).toHaveBeenCalledWith(dateTime);
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe('SetClockButton', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2020-10-31T00:00:00.000'));
  });

  test('renders date and time settings modal when clicked', async () => {
    const logOut = jest.fn();
    render(
      <SetClockButton logOut={logOut}>Update Date and Time</SetClockButton>
    );

    // Open Modal
    userEvent.click(screen.getByText('Update Date and Time'));
    await screen.findByRole('heading', { name: 'Set Date and Time' });

    // Cancel date change
    userEvent.click(within(screen.getByTestId('modal')).getByText('Cancel'));
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    expect(mockApiClient.setClock).not.toHaveBeenCalled();

    // Open Modal and change date again
    userEvent.click(screen.getByText('Update Date and Time'));

    within(screen.getByTestId('modal')).getByText(
      'Sat, Oct 31, 2020, 12:00 AM AKDT'
    );

    const selectYear = screen.getByTestId<HTMLSelectElement>('selectYear');
    const optionYear =
      within(selectYear).getByText<HTMLOptionElement>('2025').value;
    userEvent.selectOptions(selectYear, optionYear);

    const selectMonth = screen.getByTestId('selectMonth');
    const optionMonth =
      within(selectMonth).getByText<HTMLOptionElement>('Feb').value;
    userEvent.selectOptions(selectMonth, optionMonth);

    const selectDay = screen.getByTestId('selectDay');
    const optionDay = within(selectDay).getByText<HTMLOptionElement>('3').value;
    userEvent.selectOptions(selectDay, optionDay);

    const selectHour = screen.getByTestId('selectHour');
    const optionHour =
      within(selectHour).getByText<HTMLOptionElement>('11').value;
    userEvent.selectOptions(selectHour, optionHour);

    const selectMinute = screen.getByTestId('selectMinute');
    const optionMinute =
      within(selectMinute).getByText<HTMLOptionElement>('21').value;
    userEvent.selectOptions(selectMinute, optionMinute);

    const selectMeridian = screen.getByTestId('selectMeridian');
    const optionMeridian =
      within(selectMeridian).getByText<HTMLOptionElement>('PM').value;
    userEvent.selectOptions(selectMeridian, optionMeridian);

    const selectTimezone =
      screen.getByTestId<HTMLSelectElement>('selectTimezone');
    const optionTimezone = within(selectTimezone).getByText<HTMLOptionElement>(
      'Central Standard Time (Chicago)'
    );
    expect(optionTimezone.selected).toBeFalsy();
    userEvent.selectOptions(selectTimezone, optionTimezone.value);

    expect(selectTimezone.value).toEqual('America/Chicago');
    expect(
      within(selectTimezone).getByText<HTMLOptionElement>(
        'Central Standard Time (Chicago)'
      ).selected
    ).toBeTruthy();

    userEvent.click(
      within(screen.getByTestId('modal')).getByRole('button', { name: 'Save' })
    );
    await waitFor(() =>
      expect(screen.queryByTestId('modal')).not.toBeInTheDocument()
    );
    expect(mockApiClient.setClock).toHaveBeenCalledWith({
      ianaZone: 'America/Chicago',
      isoDatetime: '2025-02-03T23:21:00.000-06:00',
    });
    expect(logOut).toHaveBeenCalledTimes(1);

    // Reopen modal and change date again
    userEvent.click(screen.getByText('Update Date and Time'));
    await screen.findByRole('heading', { name: 'Set Date and Time' });

    const selectDay2 = screen.getByTestId('selectDay');
    const optionDay2 =
      within(selectDay2).getByText<HTMLOptionElement>('21').value;
    userEvent.selectOptions(selectDay2, optionDay2);

    // Choose AM, then change hours
    const selectMeridian3 = screen.getByTestId('selectMeridian');
    const optionMeridian3 =
      within(selectMeridian3).getByText<HTMLOptionElement>('AM').value;
    userEvent.selectOptions(selectMeridian3, optionMeridian3);

    const selectHour2 = screen.getByTestId('selectHour');
    const optionHour2 =
      within(selectHour2).getByText<HTMLOptionElement>('11').value;
    userEvent.selectOptions(selectHour2, optionHour2);

    const selectTimezone2 =
      screen.getByTestId<HTMLSelectElement>('selectTimezone');
    const optionTimezone2 = within(
      selectTimezone2
    ).getByText<HTMLOptionElement>('Pacific Daylight Time (Los Angeles)');
    expect(optionTimezone2.selected).toBeFalsy();
    userEvent.selectOptions(selectTimezone2, optionTimezone2.value);

    // Save Date and Timezone
    userEvent.click(within(screen.getByTestId('modal')).getButton('Save'));
    await waitFor(() =>
      expect(screen.queryByTestId('modal')).not.toBeInTheDocument()
    );
    expect(mockApiClient.setClock).toHaveBeenLastCalledWith({
      ianaZone: 'America/Los_Angeles',
      isoDatetime: '2020-10-21T11:00:00.000-07:00',
    });
    expect(logOut).toHaveBeenCalledTimes(2);
  });
});

describe('CurrentDateAndTime', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2020-10-31T00:00:00.000'));
  });

  test('renders current date and time', async () => {
    render(<CurrentDateAndTime />);
    screen.getByText('Sat, Oct 31, 2020, 12:00 AM AKDT');
    act(() => {
      jest.advanceTimersByTime(1000 * 60);
    });
    await screen.findByText('Sat, Oct 31, 2020, 12:01 AM AKDT');
  });
});
