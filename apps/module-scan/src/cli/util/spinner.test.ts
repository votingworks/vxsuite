import ora from 'ora'
import Spinner, { countProvider, durationProvider } from './spinner'

jest.useFakeTimers()

test('durationProvider counts up starting from 3s', () => {
  const duration = durationProvider()
  expect(duration.toString()).toEqual('')
  expect(duration.toString(1000)).toEqual('')
  expect(duration.toString(2000)).toEqual('')
  expect(duration.toString(3000)).toEqual('3s')
  expect(duration.toString(4000)).toEqual('4s')
  expect(duration.toString(60_000)).toEqual('1m')
  expect(duration.toString(60 * 60_000)).toEqual('1h')
  expect(duration.toString(60 * 60_000 + 23 * 60_000 + 19_000)).toEqual(
    '1h 23m 19s'
  )
})

test('durationProvider triggers an update every 1s', () => {
  const duration = durationProvider()
  const update = jest.fn()
  duration.init?.(update)

  expect(update).not.toHaveBeenCalled()
  jest.advanceTimersByTime(1000)
  expect(update).toHaveBeenCalledTimes(1)
  jest.advanceTimersByTime(1000)
  expect(update).toHaveBeenCalledTimes(2)
})

test('countProvider renders a count', () => {
  const count = countProvider()
  expect(count.toString()).toEqual('0')
  count.increment()
  expect(count.toString()).toEqual('1')
  count.increment()
  expect(count.toString()).toEqual('2')
})

test('countProvider triggers an update on increment', () => {
  const count = countProvider()
  const update = jest.fn()
  count.init?.(update)
  expect(update).not.toHaveBeenCalled()
  count.increment()
  expect(update).toHaveBeenCalledTimes(1)
})

test('spinner renders to an Ora instance from static text', () => {
  const o = ora()
  const spinner = new Spinner(o, 'hello', ' ', 'world')
  spinner.update()
  expect(o.text).toEqual('hello world')
})

test('spinner renders to an Ora instance dynamic text providers', () => {
  const o = ora()
  const count = countProvider()
  const spinner = new Spinner(o, { toString: (): string => 'count: ' }, count)
  spinner.update()
  expect(o.text).toEqual('count: 0')
  count.increment()
  expect(o.text).toEqual('count: 1')
})

test('spinner success', () => {
  const o = ora()
  const spinner = new Spinner(o)

  expect(o.succeed).not.toHaveBeenCalled()
  spinner.succeed()
  expect(o.succeed).toHaveBeenCalled()
})
