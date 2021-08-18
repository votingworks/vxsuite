import { render } from '@testing-library/react'
import { advanceTimersAndPromises } from '@votingworks/test-utils'
import { sleep } from '@votingworks/utils'
import React, { useEffect } from 'react'
import { useCancelablePromise } from './useCancelablePromise'

beforeEach(() => {
  jest.useFakeTimers()
})

test('resolves when component is still mounted', async () => {
  const resolve = jest.fn()

  const TestComponent = () => {
    const makeCancelable = useCancelablePromise()

    useEffect(() => {
      void makeCancelable(sleep(10)).then(resolve)
    }, [makeCancelable])

    return <div />
  }

  render(<TestComponent />)
  expect(resolve).not.toHaveBeenCalled()
  await advanceTimersAndPromises(10)
  expect(resolve).toHaveBeenCalled()
})

test('rejects when component is still mounted', async () => {
  const reject = jest.fn()

  const TestComponent = () => {
    const makeCancelable = useCancelablePromise()

    useEffect(() => {
      void makeCancelable(sleep(10).then(() => Promise.reject())).catch(reject)
    }, [makeCancelable])

    return <div />
  }

  render(<TestComponent />)
  expect(reject).not.toHaveBeenCalled()
  await advanceTimersAndPromises(10)
  expect(reject).toHaveBeenCalled()
})

test('does not resolve when component is unmounted', async () => {
  const resolve = jest.fn()

  const TestComponent = () => {
    const makeCancelable = useCancelablePromise()

    useEffect(() => {
      void makeCancelable(sleep(10)).then(resolve)
    }, [makeCancelable])

    return <div />
  }

  const { unmount } = render(<TestComponent />)
  expect(resolve).not.toHaveBeenCalled()
  unmount()
  await advanceTimersAndPromises(10)
  expect(resolve).not.toHaveBeenCalled()
})

test('does not reject when component is unmounted', async () => {
  const reject = jest.fn()

  const TestComponent = () => {
    const makeCancelable = useCancelablePromise()

    useEffect(() => {
      void makeCancelable(sleep(10).then(() => Promise.reject())).then(reject)
    }, [makeCancelable])

    return <div />
  }

  const { unmount } = render(<TestComponent />)
  expect(reject).not.toHaveBeenCalled()
  unmount()
  await advanceTimersAndPromises(10)
  expect(reject).not.toHaveBeenCalled()
})

test('optionally calls a callback when canceling', async () => {
  const resolve = jest.fn()
  const cancel = jest.fn()

  const TestComponent = () => {
    const makeCancelable = useCancelablePromise()

    useEffect(() => {
      void makeCancelable(sleep(10), cancel).then(resolve)
    }, [makeCancelable])

    return <div />
  }

  const { unmount } = render(<TestComponent />)
  expect(resolve).not.toHaveBeenCalled()
  expect(cancel).not.toHaveBeenCalled()
  unmount()
  await advanceTimersAndPromises(10)
  expect(resolve).not.toHaveBeenCalled()
  expect(cancel).toHaveBeenCalled()
})
