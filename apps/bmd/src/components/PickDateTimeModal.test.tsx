import { fireEvent, render, screen } from '@testing-library/react'
import { DateTime } from 'luxon'
import React from 'react'
import PickDateTimeModal from './PickDateTimeModal'

function getSelect(testId: string): HTMLSelectElement {
  return screen.getByTestId(testId) as HTMLSelectElement
}

const aDate = DateTime.fromObject({
  year: 2021,
  month: 3,
  day: 31,
  hour: 19,
  minute: 34,
  second: 56,
  zone: 'America/Los_Angeles',
})

test('shows pickers for the datetime parts of the given time', () => {
  const onCancel = jest.fn()
  const onSave = jest.fn()
  render(
    <PickDateTimeModal
      onCancel={onCancel}
      onSave={onSave}
      saveLabel="Save"
      value={aDate}
    />
  )

  expect(getSelect('selectYear').value).toEqual('2021')
  expect(getSelect('selectMonth').value).toEqual('3')
  expect(getSelect('selectDay').value).toEqual('31')
  expect(getSelect('selectHour').value).toEqual('7')
  expect(getSelect('selectMinute').value).toEqual('34')
  expect(getSelect('selectMeridian').value).toEqual('PM')
  expect(getSelect('selectTimezone').value).toEqual('America/Los_Angeles')
})

test('updates the displayed time as changes are made', () => {
  const onCancel = jest.fn()
  const onSave = jest.fn()
  render(
    <PickDateTimeModal
      onCancel={onCancel}
      onSave={onSave}
      saveLabel="Save"
      value={aDate}
    />
  )

  // Starts with the right value
  screen.getByText('Wed, Mar 31, 2021, 7:34 PM')

  // Change year
  fireEvent.change(getSelect('selectYear'), { target: { value: '2025' } })
  screen.getByText('Mon, Mar 31, 2025, 7:34 PM')

  // Change month
  fireEvent.change(getSelect('selectMonth'), { target: { value: '11' } })
  screen.getByText('Sun, Nov 30, 2025, 7:34 PM')

  // Change day
  fireEvent.change(getSelect('selectDay'), { target: { value: '20' } })
  screen.getByText('Thu, Nov 20, 2025, 7:34 PM')

  // Change hour
  fireEvent.change(getSelect('selectHour'), { target: { value: '3' } })
  screen.getByText('Thu, Nov 20, 2025, 3:34 PM')

  // Change minute
  fireEvent.change(getSelect('selectMinute'), { target: { value: '1' } })
  screen.getByText('Thu, Nov 20, 2025, 3:01 PM')

  // Change meridian
  fireEvent.change(getSelect('selectMeridian'), { target: { value: 'AM' } })
  screen.getByText('Thu, Nov 20, 2025, 3:01 AM')

  // Change timezone (does not change display)
  fireEvent.change(getSelect('selectTimezone'), {
    target: { value: 'America/Chicago' },
  })
  screen.getByText('Thu, Nov 20, 2025, 3:01 AM')
})

test('calls back with the new date on save', () => {
  const onCancel = jest.fn()
  const onSave = jest.fn()
  render(
    <PickDateTimeModal
      onCancel={onCancel}
      onSave={onSave}
      saveLabel="Save"
      value={aDate}
    />
  )

  expect(onSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Save'))

  // No changes yet, expect the same date
  expect(onSave).toHaveBeenNthCalledWith(1, aDate)

  // Make a change & save
  const changedDay = 20
  fireEvent.change(getSelect('selectDay'), {
    target: { value: changedDay.toString() },
  })
  fireEvent.click(screen.getByText('Save'))

  // Expect a changed date
  expect(onSave).toHaveBeenNthCalledWith(
    2,
    aDate.set({ day: changedDay, second: 0 })
  )

  // Make a timezone change & save
  fireEvent.change(getSelect('selectTimezone'), {
    target: { value: 'America/Chicago' },
  })
  fireEvent.click(screen.getByText('Save'))

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
  )
})

test('calls back on cancel', () => {
  const onCancel = jest.fn()
  const onSave = jest.fn()
  render(
    <PickDateTimeModal
      onCancel={onCancel}
      onSave={onSave}
      saveLabel="Save"
      value={aDate}
    />
  )

  expect(onCancel).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Cancel'))
  expect(onCancel).toHaveBeenCalledTimes(1)
})
