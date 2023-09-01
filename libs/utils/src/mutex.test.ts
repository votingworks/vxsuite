import { Mutex } from './mutex';

test('sync lock flow', () => {
  const mutex = new Mutex(0);
  expect(mutex.isLocked()).toEqual(false);
  const locked = mutex.lock()!;
  expect(mutex.isLocked()).toEqual(true);
  expect(locked).toEqual({
    value: 0,
    unlock: expect.any(Function),
  });
  locked.unlock();
  expect(mutex.isLocked()).toEqual(false);
  expect(() => locked.unlock()).toThrow();
});

test('async lock flow', async () => {
  const mutex = new Mutex(0);
  expect(mutex.isLocked()).toEqual(false);
  const locked = await mutex.asyncLock();
  expect(mutex.isLocked()).toEqual(true);
  expect(locked).toEqual({
    value: 0,
    unlock: expect.any(Function),
  });
  locked.unlock();
  expect(mutex.isLocked()).toEqual(false);
  expect(() => locked.unlock()).toThrow();
});

test('asyncLock waits for lock to be released', async () => {
  const mutex = new Mutex(0);
  const locked1Promise = mutex.asyncLock();
  const locked2Promise = mutex.asyncLock();
  const locked1Resolved = jest.fn();
  const locked2Resolved = jest.fn();

  expect(mutex.isLocked()).toEqual(true);
  void locked1Promise.then(locked1Resolved);
  void locked2Promise.then(locked2Resolved);
  expect(locked1Resolved).not.toHaveBeenCalled();
  expect(locked2Resolved).not.toHaveBeenCalled();

  const { value: value1, unlock: unlock1 } = await locked1Promise;
  expect(value1).toEqual(0);
  expect(mutex.isLocked()).toEqual(true);
  expect(locked1Resolved).toHaveBeenCalled();
  expect(locked2Resolved).not.toHaveBeenCalled();
  unlock1();

  const { value: value2, unlock: unlock2 } = await locked2Promise;
  expect(value2).toEqual(0);
  expect(mutex.isLocked()).toEqual(true);
  expect(locked2Resolved).toHaveBeenCalled();
  unlock2();

  expect(mutex.isLocked()).toEqual(false);
});

test('withLock', async () => {
  const mutex = new Mutex(0);
  const withLockReturnValue = await mutex.withLock(async (value) => {
    expect(mutex.isLocked()).toEqual(true);
    return Promise.resolve(value + 1);
  });
  expect(withLockReturnValue).toEqual(1);
  expect(mutex.isLocked()).toEqual(false);
});
