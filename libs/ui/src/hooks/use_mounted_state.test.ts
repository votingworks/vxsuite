import { renderHook } from '@testing-library/react-hooks';
import { useMountedState } from './use_mounted_state';

test('useMountedState', () => {
  const { result, unmount } = renderHook(() => useMountedState());
  const isMounted = result.current;
  expect(isMounted()).toEqual(true);
  unmount();
  expect(isMounted()).toEqual(false);
});
