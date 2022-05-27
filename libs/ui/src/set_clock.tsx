import { DateTime } from 'luxon';
import React, { useCallback, useState } from 'react';

import {
  AMERICA_TIMEZONES,
  formatFullDateTimeZone,
  formatTimeZoneName,
  getDaysInMonth,
  integers,
  MONTHS_SHORT,
} from '@votingworks/utils';
import { SelectChangeEventFunction } from '@votingworks/types';
import { Prose } from './prose';
import { Select } from './select';
import { Modal } from './modal';
import { InputGroup } from './input_group';
import { Button, ButtonProps } from './button';
import { useNow } from './hooks/use_now';

export const MIN_YEAR = 2020;
export const MAX_YEAR = 2030;

export interface PickDateAndTimeProps {
  disabled?: boolean;
  onCancel(): void;
  onSave(value: DateTime): void;
  saveLabel: string;
  value: DateTime;
}

export function PickDateTimeModal({
  disabled = false,
  onCancel,
  onSave,
  saveLabel,
  value: currentValue,
}: PickDateAndTimeProps): JSX.Element {
  const [newValue, setNewValue] = useState(currentValue);
  const systemMeridian = newValue.hour < 12 ? 'AM' : 'PM';

  const updateTimePart: SelectChangeEventFunction = (event) => {
    const { name, value: stringValue } = event.currentTarget;
    // eslint-disable-next-line vx/gts-safe-number-parse
    const partValue = parseInt(stringValue, 10);
    let { hour } = newValue;
    if (name === 'hour') {
      if (systemMeridian === 'AM') {
        hour = partValue % 12;
      } else {
        hour = (partValue % 12) + 12;
      }
    }
    if (name === 'meridian') {
      if (stringValue === 'AM' && newValue.hour >= 12) {
        hour = newValue.hour - 12;
      }
      if (stringValue === 'PM' && newValue.hour < 12) {
        hour = newValue.hour + 12;
      }
    }
    const year = name === 'year' ? partValue : newValue.year;
    const month = name === 'month' ? partValue : newValue.month;
    const daysInMonth = getDaysInMonth(year, month);
    const lastDayOfMonth = daysInMonth[daysInMonth.length - 1].day;
    const day = name === 'day' ? partValue : newValue.day;
    setNewValue(
      DateTime.fromObject({
        year,
        month,
        day: lastDayOfMonth && day > lastDayOfMonth ? lastDayOfMonth : day,
        hour,
        minute: name === 'minute' ? partValue : newValue.minute,
        zone: newValue.zone,
      })
    );
  };
  const updateTimeZone: SelectChangeEventFunction = useCallback(
    (event) => {
      setNewValue(
        DateTime.fromObject({
          year: newValue.year,
          month: newValue.month,
          day: newValue.day,
          hour: newValue.hour,
          minute: newValue.minute,
          second: newValue.second,
          zone: event.currentTarget.value,
        })
      );
    },
    [newValue, setNewValue]
  );
  function saveDateAndZone() {
    onSave(newValue);
  }

  return (
    <Modal
      centerContent
      content={
        <Prose textCenter>
          <h1>{formatFullDateTimeZone(newValue)}</h1>
          <div>
            <p>
              <InputGroup as="span">
                <Select
                  data-testid="selectYear"
                  value={newValue.year}
                  name="year"
                  disabled={disabled}
                  onBlur={updateTimePart}
                  onChange={updateTimePart}
                >
                  <option value="" disabled>
                    Year
                  </option>
                  {[...integers({ from: MIN_YEAR, through: MAX_YEAR })].map(
                    (year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    )
                  )}
                </Select>
                <Select
                  data-testid="selectMonth"
                  value={newValue.month}
                  name="month"
                  disabled={disabled}
                  onBlur={updateTimePart}
                  onChange={updateTimePart}
                  style={{
                    width: '4.7rem',
                  }}
                >
                  <option value="" disabled>
                    Month
                  </option>
                  {MONTHS_SHORT.map((month, index) => (
                    <option key={month} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </Select>
                <Select
                  data-testid="selectDay"
                  value={newValue.day}
                  name="day"
                  disabled={disabled}
                  onBlur={updateTimePart}
                  onChange={updateTimePart}
                  style={{
                    width: '4.15rem',
                  }}
                >
                  <option value="" disabled>
                    Day
                  </option>
                  {getDaysInMonth(newValue.year, newValue.month).map(
                    ({ day }) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    )
                  )}
                </Select>
              </InputGroup>
            </p>
            <p>
              <InputGroup as="span">
                <Select
                  data-testid="selectHour"
                  value={newValue.hour % 12 || 12}
                  name="hour"
                  disabled={disabled}
                  onBlur={updateTimePart}
                  onChange={updateTimePart}
                  style={{
                    width: '4rem',
                  }}
                >
                  <option value="" disabled>
                    Hour
                  </option>
                  {[...integers({ from: 1, through: 12 })].map((hour) => (
                    <option key={hour} value={hour}>
                      {hour}
                    </option>
                  ))}
                </Select>
                <Select
                  data-testid="selectMinute"
                  value={newValue.minute}
                  name="minute"
                  disabled={disabled}
                  onBlur={updateTimePart}
                  onChange={updateTimePart}
                  style={{
                    width: '4.15rem',
                  }}
                >
                  <option value="" disabled>
                    Minute
                  </option>
                  {[...integers({ from: 0, through: 59 })].map((minute) => (
                    <option key={minute} value={minute}>
                      {minute < 10 ? `0${minute}` : minute}
                    </option>
                  ))}
                </Select>
                <Select
                  data-testid="selectMeridian"
                  value={systemMeridian}
                  name="meridian"
                  disabled={disabled}
                  onBlur={updateTimePart}
                  onChange={updateTimePart}
                  style={{
                    width: '4.5rem',
                  }}
                >
                  {['AM', 'PM'].map((meridian) => (
                    <option key={meridian} value={meridian}>
                      {meridian}
                    </option>
                  ))}
                </Select>
              </InputGroup>
            </p>
            <p>
              <InputGroup as="span">
                <Select
                  data-testid="selectTimezone"
                  value={newValue.zoneName}
                  disabled={disabled}
                  onBlur={updateTimeZone}
                  onChange={updateTimeZone}
                >
                  <option value="UTC" disabled>
                    Select timezone…
                  </option>
                  {AMERICA_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {formatTimeZoneName(
                        DateTime.fromISO(newValue.toISO(), { zone: tz })
                      )}{' '}
                      ({tz.split('/')[1].replace(/_/gi, ' ')})
                    </option>
                  ))}
                </Select>
              </InputGroup>
            </p>
          </div>
        </Prose>
      }
      actions={
        <React.Fragment>
          <Button
            disabled={disabled}
            primary={!disabled}
            onPress={saveDateAndZone}
          >
            {saveLabel}
          </Button>
          <Button disabled={disabled} onPress={onCancel}>
            Cancel
          </Button>
        </React.Fragment>
      }
    />
  );
}

type SetClockButtonProps = Omit<ButtonProps, 'onPress'>;

export function SetClockButton(props: SetClockButtonProps): JSX.Element {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingClock, setIsSettingClock] = useState(false);
  const systemDate = useNow();

  async function setClock(date: DateTime) {
    setIsSettingClock(true);
    try {
      if (window.kiosk) {
        await window.kiosk.setClock({
          isoDatetime: date.toISO(),
          // TODO: Rename to `ianaZone` in kiosk-browser and update here.
          // eslint-disable-next-line vx/gts-identifiers
          IANAZone: date.zoneName,
        });
      }
      setIsModalOpen(false);
    } finally {
      setIsSettingClock(false);
    }
  }

  return (
    <React.Fragment>
      <Button {...props} onPress={() => setIsModalOpen(true)} />
      {isModalOpen && (
        <PickDateTimeModal
          disabled={isSettingClock}
          onCancel={() => setIsModalOpen(false)}
          onSave={setClock}
          saveLabel={isSettingClock ? 'Saving…' : 'Save'}
          value={systemDate}
        />
      )}
    </React.Fragment>
  );
}

export function CurrentDateAndTime(): JSX.Element {
  const systemDate = useNow();
  return (
    <span>
      {formatFullDateTimeZone(systemDate, {
        includeTimezone: true,
      })}
    </span>
  );
}
