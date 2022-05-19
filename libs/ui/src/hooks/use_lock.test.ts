import { renderHook } from '@testing-library/react-hooks';
import { useLock } from './use_lock';

test('locks and unlocks', () => {
  const { result } = renderHook(() => useLock());
  const { current: lock } = result;
  expect(lock.lock()).toBe(true);
  expect(lock.lock()).toBe(false);
  lock.unlock();
  expect(lock.lock()).toBe(true);
});

test('doesnt trigger a rerender on lock', () => {
  let numRenders = 0;
  const { result } = renderHook(() => {
    const lock = useLock();
    numRenders += 1;
    return lock;
  });
  expect(numRenders).toBe(1);
  result.current.lock();
  expect(numRenders).toBe(1);
});
