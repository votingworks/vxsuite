import { DateTime } from 'luxon'
import React, { useCallback, useState } from 'react'
import { SelectChangeEventFunction } from '../config/types'
import {
  AMERICA_TIMEZONES,
  formatFullDateTimeZone,
  formatTimeZoneName,
  getDaysInMonth,
  MONTHS_SHORT,
} from '../utils/date'
import Button from './Button'
import InputGroup from './InputGroup'
import Modal from './Modal'
import Prose from './Prose'
import Select from './Select'

type Meridian = 'AM' | 'PM'

export interface Props {
  systemDate: DateTime
  setSystemDate(value: DateTime): void
  setIsSystemDateModalActive(value: boolean): void
}

const ChangeDateTimeModal: React.FC<Props> = ({
  systemDate,
  setSystemDate,
  setIsSystemDateModalActive,
}) => {
  const [isSavingDate, setIsSavingDate] = useState(false)
  const [systemMeridian, setSystemMeridan] = useState<Meridian>(
    systemDate.hour < 12 ? 'AM' : 'PM'
  )

  const cancelSystemDateEdit = () => {
    setSystemDate(DateTime.local())
    setIsSystemDateModalActive(false)
  }
  const updateSystemTime: SelectChangeEventFunction = (event) => {
    const { name, value: stringValue } = event.currentTarget
    const value = parseInt(stringValue, 10)
    let { hour } = systemDate
    if (name === 'hour') {
      if (systemMeridian === 'AM') {
        hour = value % 12
      } else {
        hour = (value % 12) + 12
      }
    }
    if (name === 'meridian') {
      setSystemMeridan(stringValue as Meridian)
      if (stringValue === 'AM' && systemDate.hour >= 12) {
        hour = systemDate.hour - 12
      }
      if (stringValue === 'PM' && systemDate.hour < 12) {
        hour = systemDate.hour + 12
      }
    }
    const year = name === 'year' ? value : systemDate.year
    const month = name === 'month' ? value : systemDate.month
    const lastDayOfMonth = getDaysInMonth(year, month).slice(-1).pop()?.day
    const day = name === 'day' ? value : systemDate.day
    setSystemDate(
      DateTime.fromObject({
        year,
        month,
        day: lastDayOfMonth && day > lastDayOfMonth ? lastDayOfMonth : day,
        hour,
        minute: name === 'minute' ? value : systemDate.minute,
        zone: systemDate.zone,
      })
    )
  }
  const updateTimeZone: SelectChangeEventFunction = useCallback(
    (event) => {
      setSystemDate(
        DateTime.fromObject({
          year: systemDate.year,
          month: systemDate.month,
          day: systemDate.day,
          hour: systemDate.hour,
          minute: systemDate.minute,
          second: systemDate.second,
          zone: event.currentTarget.value,
        })
      )
    },
    [systemDate, setSystemDate]
  )
  const saveDateAndZone = async () => {
    setIsSavingDate(true)
    await window.kiosk?.setClock({
      isoDatetime: systemDate.toISO(),
      IANAZone: systemDate.zoneName,
    })
    setSystemDate(DateTime.local())
    setIsSavingDate(false)
    setIsSystemDateModalActive(false)
  }

  return (
    <Modal
      centerContent
      content={
        <Prose textCenter>
          <h1>{formatFullDateTimeZone(systemDate)}</h1>
          <div>
            <p>
              <InputGroup as="span">
                <Select
                  data-testid="selectYear"
                  value={systemDate.year}
                  name="year"
                  disabled={isSavingDate}
                  onBlur={updateSystemTime}
                  onChange={updateSystemTime}
                >
                  <option value="" disabled>
                    Year
                  </option>
                  {[...Array(11).keys()].map((i) => (
                    <option key={i} value={2020 + i}>
                      {2020 + i}
                    </option>
                  ))}
                </Select>
                <Select
                  data-testid="selectMonth"
                  value={systemDate.month}
                  name="month"
                  disabled={isSavingDate}
                  onBlur={updateSystemTime}
                  onChange={updateSystemTime}
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
                  value={systemDate.day}
                  name="day"
                  disabled={isSavingDate}
                  onBlur={updateSystemTime}
                  onChange={updateSystemTime}
                  style={{
                    width: '4.15rem',
                  }}
                >
                  <option value="" disabled>
                    Day
                  </option>
                  {getDaysInMonth(systemDate.year, systemDate.month).map(
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
                  value={systemDate.hour % 12 || 12}
                  name="hour"
                  disabled={isSavingDate}
                  onBlur={updateSystemTime}
                  onChange={updateSystemTime}
                  style={{
                    width: '4rem',
                  }}
                >
                  <option value="" disabled>
                    Hour
                  </option>
                  {[...Array(12).keys()].map((hour) => (
                    <option key={hour} value={hour + 1}>
                      {hour + 1}
                    </option>
                  ))}
                </Select>
                <Select
                  data-testid="selectMinute"
                  value={systemDate.minute}
                  name="minute"
                  disabled={isSavingDate}
                  onBlur={updateSystemTime}
                  onChange={updateSystemTime}
                  style={{
                    width: '4.15rem',
                  }}
                >
                  <option value="" disabled>
                    Minute
                  </option>
                  {[...Array(60).keys()].map((minute) => (
                    <option key={minute} value={minute}>
                      {minute < 10 ? `0${minute}` : minute}
                    </option>
                  ))}
                </Select>
                <Select
                  data-testid="selectMeridian"
                  value={systemMeridian}
                  name="meridian"
                  disabled={isSavingDate}
                  onBlur={updateSystemTime}
                  onChange={updateSystemTime}
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
                  value={systemDate.zoneName}
                  disabled={isSavingDate}
                  onBlur={updateTimeZone}
                  onChange={updateTimeZone}
                >
                  <option value="UTC" disabled>
                    Select timezone…
                  </option>
                  {AMERICA_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {formatTimeZoneName(
                        DateTime.fromISO(systemDate.toISO(), { zone: tz })
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
            disabled={isSavingDate}
            primary={!isSavingDate}
            onPress={saveDateAndZone}
          >
            {isSavingDate ? 'Saving…' : 'Save'}
          </Button>
          <Button disabled={isSavingDate} onPress={cancelSystemDateEdit}>
            Cancel
          </Button>
        </React.Fragment>
      }
    />
  )
}

export default ChangeDateTimeModal
