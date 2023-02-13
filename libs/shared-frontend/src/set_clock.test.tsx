import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { DateTime } from 'luxon';
import MockDate from 'mockdate';
import React from 'react';
import fc from 'fast-check';
import { arbitraryDateTime, fakeKiosk } from '@votingworks/test-utils';
import { act } from '@testing-library/react-hooks';
import {
  PickDateTimeModal,
  MAX_YEAR,
  MIN_YEAR,
  SetClockButton,
  CurrentDateAndTime,
} from './set_clock';

function getSelect(testId: string): HTMLSelectElement {
  return screen.getByTestId(testId);
}

const aDate = DateTime.fromObject({
  year: 2021,
  month: 3,
  day: 31,
  hour: 19,
  minute: 34,
  second: 56,
  zone: 'America/Los_Angeles',
});

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

  test('updates the displayed time as changes are made', () => {
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

    // Starts with the right value
    screen.getByText('Wed, Mar 31, 2021, 7:34 PM');

    // Change year
    fireEvent.change(getSelect('selectYear'), { target: { value: '2025' } });
    screen.getByText('Mon, Mar 31, 2025, 7:34 PM');

    // Change month
    fireEvent.change(getSelect('selectMonth'), { target: { value: '11' } });
    screen.getByText('Sun, Nov 30, 2025, 7:34 PM');

    // Change day
    fireEvent.change(getSelect('selectDay'), { target: { value: '20' } });
    screen.getByText('Thu, Nov 20, 2025, 7:34 PM');

    // Change hour
    fireEvent.change(getSelect('selectHour'), { target: { value: '3' } });
    screen.getByText('Thu, Nov 20, 2025, 3:34 PM');

    // Change minute
    fireEvent.change(getSelect('selectMinute'), { target: { value: '1' } });
    screen.getByText('Thu, Nov 20, 2025, 3:01 PM');

    // Change meridian
    fireEvent.change(getSelect('selectMeridian'), { target: { value: 'AM' } });
    screen.getByText('Thu, Nov 20, 2025, 3:01 AM');

    // Change timezone (does not change display)
    fireEvent.change(getSelect('selectTimezone'), {
      target: { value: 'America/Chicago' },
    });
    screen.getByText('Thu, Nov 20, 2025, 3:01 AM');
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
    fireEvent.click(screen.getByText('Save'));

    // No changes yet, expect the same date
    expect(onSave).toHaveBeenNthCalledWith(1, aDate);

    // Make a change & save
    const changedDay = 20;
    fireEvent.change(getSelect('selectDay'), {
      target: { value: changedDay.toString() },
    });
    fireEvent.click(screen.getByText('Save'));

    // Expect a changed date
    expect(onSave).toHaveBeenNthCalledWith(
      2,
      aDate.set({ day: changedDay, second: 0 })
    );

    // Make a timezone change & save
    fireEvent.change(getSelect('selectTimezone'), {
      target: { value: 'America/Chicago' },
    });
    fireEvent.click(screen.getByText('Save'));

    // Expect a changed timezone
    expect(onSave).toHaveBeenNthCalledWith(
      3,
      DateTime.fromObject({
        year: aDate.year,
        month: aDate.month,
        day: changedDay,
        hour: aDate.hour,
        minute: aDate.minute,
        second: 0,
        zone: 'America/Chicago',
      })
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
    fireEvent.click(screen.getByText('Cancel'));
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
          fireEvent.change(getSelect('selectYear'), {
            target: { value: dateTime.year.toString() },
          });
          fireEvent.change(getSelect('selectMonth'), {
            target: { value: dateTime.month.toString() },
          });
          fireEvent.change(getSelect('selectDay'), {
            target: { value: dateTime.day.toString() },
          });
          fireEvent.change(getSelect('selectHour'), {
            target: {
              value: (dateTime.hour > 12
                ? dateTime.hour % 12
                : dateTime.hour === 0
                ? 12
                : dateTime.hour
              ).toString(),
            },
          });
          fireEvent.change(getSelect('selectMinute'), {
            target: { value: dateTime.minute.toString() },
          });
          fireEvent.change(getSelect('selectMeridian'), {
            target: { value: dateTime.hour < 12 ? 'AM' : 'PM' },
          });
          fireEvent.click(screen.getByText('Save'));

          // Expect a changed date
          expect(onSave).toHaveBeenCalledWith(aDate.set(dateTime.toObject()));
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe('SetClockButton', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    MockDate.set('2020-10-31T00:00:00.000Z');
    window.kiosk = fakeKiosk();
  });

  afterAll(() => {
    window.kiosk = undefined;
  });

  test('renders date and time settings modal when clicked', async () => {
    render(<SetClockButton>Update Date and Time</SetClockButton>);

    // Open Modal and change date
    fireEvent.click(screen.getByText('Update Date and Time'));

    within(screen.getByTestId('modal')).getByText(
      'Sat, Oct 31, 2020, 12:00 AM'
    );

    const selectYear = screen.getByTestId<HTMLSelectElement>('selectYear');
    const optionYear =
      within(selectYear).getByText<HTMLOptionElement>('2025').value;
    fireEvent.change(selectYear, { target: { value: optionYear } });

    const selectMonth = screen.getByTestId('selectMonth');
    const optionMonth =
      within(selectMonth).getByText<HTMLOptionElement>('Feb').value;
    fireEvent.change(selectMonth, { target: { value: optionMonth } });

    // Expect day to change because Feb doesn't have 31 days.
    within(screen.getByTestId('modal')).getByText(
      'Fri, Feb 28, 2025, 12:00 AM'
    );

    const selectDay = screen.getByTestId('selectDay');
    const optionDay = within(selectDay).getByText<HTMLOptionElement>('3').value;
    fireEvent.change(selectDay, { target: { value: optionDay } });

    const selectHour = screen.getByTestId('selectHour');
    const optionHour =
      within(selectHour).getByText<HTMLOptionElement>('11').value;
    fireEvent.change(selectHour, { target: { value: optionHour } });

    const selectMinute = screen.getByTestId('selectMinute');
    const optionMinute =
      within(selectMinute).getByText<HTMLOptionElement>('21').value;
    fireEvent.change(selectMinute, { target: { value: optionMinute } });

    const selectMeridian = screen.getByTestId('selectMeridian');
    const optionMeridian =
      within(selectMeridian).getByText<HTMLOptionElement>('PM').value;
    fireEvent.change(selectMeridian, { target: { value: optionMeridian } });

    // Expect day, hour, minute, and meridian to update
    within(screen.getByTestId('modal')).getByText('Mon, Feb 3, 2025, 11:21 PM');

    const selectTimezone =
      screen.getByTestId<HTMLSelectElement>('selectTimezone');
    const optionTimezone = within(selectTimezone).getByText<HTMLOptionElement>(
      'Central Standard Time (Chicago)'
    );
    expect(optionTimezone.selected).toBeFalsy();
    fireEvent.change(selectTimezone, {
      target: { value: optionTimezone.value },
    });

    expect(selectTimezone.value).toEqual('America/Chicago');
    expect(
      within(selectTimezone).getByText<HTMLOptionElement>(
        'Central Standard Time (Chicago)'
      ).selected
    ).toBeTruthy();

    screen.getByText('Mon, Feb 3, 2025, 11:21 PM');

    // Cancel date change
    fireEvent.click(within(screen.getByTestId('modal')).getByText('Cancel'));
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    expect(window.kiosk?.setClock).not.toHaveBeenCalled();

    // Open Modal and change date again
    fireEvent.click(screen.getByText('Update Date and Time'));

    const selectDay2 = screen.getByTestId('selectDay');
    const optionDay2 =
      within(selectDay2).getByText<HTMLOptionElement>('21').value;
    fireEvent.change(selectDay2, { target: { value: optionDay2 } });

    // Choose PM, then change hours
    const selectMeridian2 = screen.getByTestId('selectMeridian');
    const optionMeridian2 =
      within(selectMeridian2).getByText<HTMLOptionElement>('PM').value;
    fireEvent.change(selectMeridian2, { target: { value: optionMeridian2 } });

    const selectHour2 = screen.getByTestId('selectHour');
    const optionHour2 =
      within(selectHour2).getByText<HTMLOptionElement>('11').value;
    fireEvent.change(selectHour2, { target: { value: optionHour2 } });

    // Expect time to be in PM
    screen.getByText('Wed, Oct 21, 2020, 11:00 PM');

    // Choose AM, then change hours
    const selectMeridian3 = screen.getByTestId('selectMeridian');
    const optionMeridian3 =
      within(selectMeridian3).getByText<HTMLOptionElement>('AM').value;
    fireEvent.change(selectMeridian3, { target: { value: optionMeridian3 } });

    // Expect time to be in AM
    screen.getByText('Wed, Oct 21, 2020, 11:00 AM');

    const selectTimezone2 =
      screen.getByTestId<HTMLSelectElement>('selectTimezone');
    const optionTimezone2 = within(
      selectTimezone2
    ).getByText<HTMLOptionElement>('Pacific Daylight Time (Los Angeles)');
    expect(optionTimezone2.selected).toBeFalsy();
    fireEvent.change(selectTimezone2, {
      target: { value: optionTimezone2.value },
    });

    screen.getByText('Wed, Oct 21, 2020, 11:00 AM');

    // Save Date and Timezone
    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      fireEvent.click(within(screen.getByTestId('modal')).getByText('Save'));
    });
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    expect(window.kiosk?.setClock).toHaveBeenCalledWith({
      // eslint-disable-next-line vx/gts-identifiers
      IANAZone: 'America/Los_Angeles',
      isoDatetime: '2020-10-21T11:00:00.000-07:00',
    });
  });
});

describe('CurrentDateAndTime', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    MockDate.set('2020-10-31T00:00:00.000Z');
  });

  test('renders current date and time', () => {
    render(<CurrentDateAndTime />);
    screen.getByText('Sat, Oct 31, 2020, 12:00 AM UTC');
    MockDate.set('2020-10-31T00:01:00.000Z');
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    screen.getByText('Sat, Oct 31, 2020, 12:01 AM UTC');
  });
});
