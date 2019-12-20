import { IntervalPoller } from './polling'

describe('IntervalPoller', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  it('polls at a specific interval', () => {
    const callback = jest.fn()

    IntervalPoller.start(10, callback)

    jest.advanceTimersByTime(10)
    expect(callback).toHaveBeenCalledTimes(1)

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
})
