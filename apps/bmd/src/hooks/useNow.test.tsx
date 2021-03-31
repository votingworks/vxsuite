import React from 'react'
import { act, render, screen } from '@testing-library/react'
import MockDate from 'mockdate'
import useNow from './useNow'

MockDate.set('2021-03-31T00:00:00Z')
jest.useFakeTimers()

const Clock = () => {
  const now = useNow()

  return <p>{now.toISO()}</p>
}

test('returns the current date', () => {
  render(<Clock />)
  screen.getByText('2021-03-31T00:00:00.000+00:00')
})

test('keeps returning the right date as time moves forward', () => {
  const element = <Clock />
  render(element)
  screen.getByText('2021-03-31T00:00:00.000+00:00')

  MockDate.set('2021-03-31T00:00:01Z')
  act(() => jest.advanceTimersByTime(1000))

  screen.getByText('2021-03-31T00:00:01.000+00:00')
})
