import { waitFor } from '@testing-library/react'
import IntervalPoller from './IntervalPoller'

describe('IntervalPoller', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  it('polls at a specific interval', async () => {
    const callback = jest.fn()

    IntervalPoller.start(10, callback)

    jest.advanceTimersByTime(10)
    expect(callback).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      // Wait for promises to resolve in timeout.
    })

    jest.advanceTimersByTime(10)
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('ignores errors', () => {
    IntervalPoller.start(10, () => {
      throw new Error('callback error')
    })

    jest.advanceTimersByTime(50)
  })

  it('ignores async errors', () => {
    IntervalPoller.start(10, async () => {
      throw new Error('callback error')
    })

    jest.advanceTimersByTime(50)
  })

  it('cannot start a poller that is already started', () => {
    const callback = jest.fn()
    const poller = IntervalPoller.start(10, callback)

    poller.start()
    jest.advanceTimersByTime(10)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('can stop a poller', () => {
    const callback = jest.fn()
    const poller = IntervalPoller.start(10, callback)

    poller.stop()
    jest.advanceTimersByTime(10)
    expect(callback).not.toHaveBeenCalled()
  })

  it('can stop a poller that has not started', () => {
    const callback = jest.fn()
    const poller = new IntervalPoller(10, callback)

    poller.stop()
    jest.advanceTimersByTime(10)
    expect(callback).not.toHaveBeenCalled()
  })

  it('can stop a poller that has already fired once', async () => {
    const callback = jest.fn()
    const poller = IntervalPoller.start(10, callback)

    // Make sure the callback is called at least once.
    jest.advanceTimersByTime(10)
    expect(callback).toHaveBeenCalledTimes(1)

    // Stop polling.
    poller.stop()

    await waitFor(() => {
      // Give the async-aware callback handler time to resolve.
    })

    // Give it time to fire again, if there's a bug.
    jest.advanceTimersByTime(10)
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
