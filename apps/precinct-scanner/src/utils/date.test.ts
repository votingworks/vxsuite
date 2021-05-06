import { isSameDay } from './date'

test('isSameDay with identical dates', () => {
  const date = new Date()
  expect(isSameDay(date, date)).toBe(true)
})

test('isSameDay with dates much more than 24 hours different', () => {
  const now = new Date()
  const thirtyHoursFromNow = new Date(+now + 30 * 60 * 60 * 1000)
  expect(isSameDay(now, thirtyHoursFromNow)).toBe(false)
})

test('isSameDay is false when crossing midnight', () => {
  const now = new Date()
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  )
  const startOfTomorrow = new Date(
    startOfToday.getFullYear(),
    startOfToday.getMonth(),
    startOfToday.getDate() + 1
  )
  const endOfToday = new Date(+startOfTomorrow - 1000)
  expect(isSameDay(now, startOfToday)).toBe(true)
  expect(isSameDay(now, endOfToday)).toBe(true)
  expect(isSameDay(now, startOfTomorrow)).toBe(false)
})
