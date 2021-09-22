import { renderHook } from '@testing-library/react-hooks'
import { useMountedState } from './useMountedState'

test('useMountedState', async () => {
  const { result, unmount } = renderHook(() => useMountedState())
  const isMounted = result.current
  expect(isMounted()).toBe(true)
  unmount()
  expect(isMounted()).toBe(false)
})
