import { DateTime, HourNumbers } from 'luxon';
import React, { useCallback, useState } from 'react';

import {
  AMERICA_TIMEZONES,
  formatFullDateTimeZone,
  formatTimeZoneName,
  getDaysInMonth,
  MONTHS_SHORT,
} from '@votingworks/utils';
import { SelectChangeEventFunction } from '@votingworks/types';
import { assertDefined, integers } from '@votingworks/basics';
import styled from 'styled-components';
import { Select } from './select';
import { Modal } from './modal';
import { Button, ButtonProps } from './button';
import { useNow } from './hooks/use_now';
import { H2, P } from './typography';
import { Icons } from './icons';
import { Card } from './card';
import { ScreenInfo, useScreenInfo } from './hooks/use_screen_info';
import { useSystemCallApi } from './system_call_api';

const InputGroup = styled.div`
  display: inline-flex;
  flex-direction: row;

  & > * {
    &:focus {
      z-index: 2;
    }

    &:not(:first-child) {
      margin-left: -1px;
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
    }

    &:not(:last-child) {
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }
  }

  & > select {
    border: 1px solid #333;
    background-color: #fff;
  }
`;

const Form = styled(Card).attrs({ color: 'neutral' })<{
  screenInfo: ScreenInfo;
}>`
  > div {
    display: grid;
    justify-content: start;
    align-items: center;
    ${(p) =>
      /* istanbul ignore next */
      p.theme.sizeMode === 'desktop' || p.screenInfo.isPortrait
        ? // In desktop mode/portrait touchscreens, we want the labels on top of
          // the input groups, so we use a 1-column grid with margins after the input groups
          `
          > span {
            margin-top: 0.5rem;
            &:not(:last-child) {
              margin-bottom: 1rem;
            }
          }
        `
        : // In touch mode, we want the labels in their own column on the left
          // of the input groups to save vertical space.
          `
          grid-template-columns: max-content 1fr;
          gap: 0.5rem;
        `}
  }

  margin-bottom: ${(p) =>
    /* istanbul ignore next */
    p.theme.sizeMode === 'desktop' ? '1rem' : '0.5rem'};
`;

const Label = styled.div`
  display: block;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
`;

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

export const MIN_YEAR = 2020;
export const MAX_YEAR = 2030;

export interface PickDateAndTimeProps {
  disabled?: boolean;
  onCancel(): void;
  onSave(value: DateTime): void;
  saveLabel: string;
  value: DateTime;
}

function asHour(hour: number): HourNumbers {
  /* istanbul ignore next */
  if (hour < 0 || hour > 23) {
    throw new Error(`Invalid hour: ${hour}`);
  }

  return hour as HourNumbers;
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
  const screenInfo = useScreenInfo();

  const updateTimePart: SelectChangeEventFunction = (event) => {
    const { name, value: stringValue } = event.currentTarget;
    // eslint-disable-next-line vx/gts-safe-number-parse
    const partValue = parseInt(stringValue, 10);
    let hour = asHour(newValue.hour);
    if (name === 'hour') {
      if (systemMeridian === 'AM') {
        hour = asHour(partValue % 12);
      } else {
        hour = asHour((partValue % 12) + 12);
      }
    }
    if (name === 'meridian') {
      if (stringValue === 'AM' && newValue.hour >= 12) {
        hour = asHour(newValue.hour - 12);
      }
      if (stringValue === 'PM' && newValue.hour < 12) {
        hour = asHour(newValue.hour + 12);
      }
    }
    const year = name === 'year' ? partValue : newValue.year;
    const month = name === 'month' ? partValue : newValue.month;
    const daysInMonth = getDaysInMonth(year, month);
    const lastDayOfMonth = assertDefined(daysInMonth.at(-1)).day;
    const day = name === 'day' ? partValue : newValue.day;
    setNewValue(
      DateTime.fromObject(
        {
          year,
          month,
          day: lastDayOfMonth && day > lastDayOfMonth ? lastDayOfMonth : day,
          hour,
          minute: name === 'minute' ? partValue : newValue.minute,
        },
        { zone: newValue.zone }
      )
    );
  };
  const updateTimeZone: SelectChangeEventFunction = useCallback(
    (event) => {
      setNewValue(
        DateTime.fromObject(
          {
            year: newValue.year,
            month: newValue.month,
            day: newValue.day,
            hour: newValue.hour,
            minute: newValue.minute,
            second: newValue.second,
          },
          { zone: event.currentTarget.value }
        )
      );
    },
    [newValue, setNewValue]
  );
  function saveDateAndZone() {
    onSave(newValue);
  }

  return (
    <Modal
      content={
        <React.Fragment>
          <H2>Set Date and Time</H2>
          <P>
            <CurrentDateAndTime />
          </P>
          <Form screenInfo={screenInfo}>
            <Label>Date</Label>
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
            <Label>Time</Label>
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
            <Label>Time Zone</Label>
            <InputGroup as="span">
              <Select
                data-testid="selectTimezone"
                value={newValue.zoneName}
                disabled={disabled}
                onBlur={updateTimeZone}
                onChange={updateTimeZone}
              >
                <option value="UTC" disabled>
                  Select time zone…
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
          </Form>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Icons.Warning color="warning" /> After changing the date and time,
            you will need to insert a card and unlock the machine again.
          </div>
        </React.Fragment>
      }
      actions={
        <React.Fragment>
          <Button
            disabled={disabled}
            variant="primary"
            icon="Done"
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

type SetClockButtonProps = Omit<ButtonProps, 'onPress'> & {
  logOut: () => void;
};

export function SetClockButton({
  logOut,
  ...buttonProps
}: SetClockButtonProps): JSX.Element {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingClock, setIsSettingClock] = useState(false);
  const systemDate = useNow();

  const api = useSystemCallApi();
  const setClockMutation = api.setClock.useMutation();

  async function setClock(date: DateTime) {
    setIsSettingClock(true);
    try {
      await setClockMutation.mutateAsync({
        isoDatetime: date.toISO(),
        ianaZone: date.zoneName,
      });
      setIsModalOpen(false);
    } finally {
      setIsSettingClock(false);
    }
    // Log out after setting the clock to ensure that there are no unintended interactions with
    // session time limits, most notably to ensure that limits can't be bypassed
    logOut();
  }

  return (
    <React.Fragment>
      <Button {...buttonProps} onPress={() => setIsModalOpen(true)} />
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
