import { renderHook } from '../../test/react_testing_library';
import { useLock } from './use_lock';

test('locks and unlocks', () => {
  const { result } = renderHook(() => useLock());
  const { current: lock } = result;
  expect(lock.lock()).toEqual(true);
  expect(lock.lock()).toEqual(false);
  lock.unlock();
  expect(lock.lock()).toEqual(true);
});

test('doesnt trigger a rerender on lock', () => {
  let numRenders = 0;
  const { result } = renderHook(() => {
    const lock = useLock();
    numRenders += 1;
    return lock;
  });
  expect(numRenders).toEqual(1);
  result.current.lock();
  expect(numRenders).toEqual(1);
});
