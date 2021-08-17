import React from 'react'
import { render } from '@testing-library/react'
import { useMountedState } from './useMountedState'

test('useMountedState', async () => {
  let isMounted: (() => boolean) | undefined

  const TestComponent = () => {
    isMounted = useMountedState()
    return <div />
  }

  const { unmount } = render(<TestComponent />)
  expect(isMounted?.()).toEqual(true)
  unmount()
  expect(isMounted?.()).toEqual(false)
})
