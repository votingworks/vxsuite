import { expect, test, vi } from 'vitest';
import { Mutex } from './mutex';

test('sync lock flow', () => {
  const mutex = new Mutex();
  expect(mutex.isLocked()).toEqual(false);
  const locked = mutex.lock()!;
  expect(mutex.isLocked()).toEqual(true);
  expect(locked).toEqual({
    unlock: expect.any(Function),
  });
  locked.unlock();
  expect(mutex.isLocked()).toEqual(false);
  expect(() => locked.unlock()).toThrow();
});

test('sync lock flow with a value', () => {
  const mutex = new Mutex({ count: 123 });
  expect(mutex.isLocked()).toEqual(false);
  const locked = mutex.lock()!;
  expect(mutex.isLocked()).toEqual(true);
  expect(locked).toEqual({
    value: { count: 123 },
    unlock: expect.any(Function),
  });
  locked.value.count += 1;
  locked.unlock();
  expect(mutex.isLocked()).toEqual(false);
  expect(() => locked.unlock()).toThrow();
  expect(() => locked.value).toThrowError('value accessed after unlock');
  expect(mutex.lock()?.value.count).toEqual(124);
});

test('async lock flow', async () => {
  const mutex = new Mutex();
  expect(mutex.isLocked()).toEqual(false);
  const locked = await mutex.asyncLock();
  expect(mutex.isLocked()).toEqual(true);
  expect(locked).toEqual({
    unlock: expect.any(Function),
  });
  locked.unlock();
  expect(mutex.isLocked()).toEqual(false);
  expect(() => locked.unlock()).toThrow();
});

test('async lock flow with a value', async () => {
  const mutex = new Mutex({ count: 123 });
  expect(mutex.isLocked()).toEqual(false);
  const locked = await mutex.asyncLock();
  expect(mutex.isLocked()).toEqual(true);
  expect(locked).toEqual({
    value: { count: 123 },
    unlock: expect.any(Function),
  });
  locked.value.count += 1;
  locked.unlock();
  expect(mutex.isLocked()).toEqual(false);
  expect(() => locked.unlock()).toThrow();
  expect(() => locked.value).toThrowError('value accessed after unlock');
  expect(mutex['asyncQueue']).toHaveLength(0);
  expect((await mutex.asyncLock()).value.count).toEqual(124);
});

test('asyncLock waits for lock to be released', async () => {
  const mutex = new Mutex();
  const locked1Promise = mutex.asyncLock();
  const locked2Promise = mutex.asyncLock();
  const locked3Promise = mutex.asyncLock();
  const locked1Resolved = vi.fn();
  const locked2Resolved = vi.fn();
  const locked3Resolved = vi.fn();

  // The first should be acquired immediately.
  expect(mutex['asyncQueue']).toHaveLength(2);

  expect(mutex.isLocked()).toEqual(true);
  void locked1Promise.then(locked1Resolved);
  void locked2Promise.then(locked2Resolved);
  void locked3Promise.then(locked3Resolved);
  expect(locked1Resolved).not.toHaveBeenCalled();
  expect(locked2Resolved).not.toHaveBeenCalled();
  expect(locked3Resolved).not.toHaveBeenCalled();

  const { unlock: unlock1 } = await locked1Promise;
  expect(mutex.isLocked()).toEqual(true);
  expect(locked1Resolved).toHaveBeenCalled();
  expect(locked2Resolved).not.toHaveBeenCalled();
  expect(locked3Resolved).not.toHaveBeenCalled();
  unlock1();

  // The second lock should be acquired.
  expect(mutex['asyncQueue']).toHaveLength(1);

  const { unlock: unlock2 } = await locked2Promise;
  expect(mutex.isLocked()).toEqual(true);
  expect(locked2Resolved).toHaveBeenCalled();
  expect(locked3Resolved).not.toHaveBeenCalled();
  unlock2();

  // The third lock should be acquired.
  expect(mutex['asyncQueue']).toHaveLength(0);

  const { unlock: unlock3 } = await locked3Promise;
  expect(mutex.isLocked()).toEqual(true);
  expect(locked3Resolved).toHaveBeenCalled();
  unlock3();

  expect(mutex.isLocked()).toEqual(false);
});

test('withLock', async () => {
  const mutex = new Mutex();
  const withLockReturnValue = await mutex.withLock(() => {
    expect(mutex.isLocked()).toEqual(true);
    return Promise.resolve('hello');
  });
  expect(withLockReturnValue).toEqual('hello');
  expect(mutex.isLocked()).toEqual(false);

  await expect(
    mutex.withLock(() => {
      expect(mutex.isLocked()).toEqual(true);
      throw new Error('this lock should still be released');
    })
  ).rejects.toThrowError('this lock should still be released');

  expect(mutex.isLocked()).toEqual(false);
});

test('immediate sync lock with pending async lock', async () => {
  const mutex = new Mutex();
  const locked1Resolved = mutex.asyncLock();
  const locked2Resolved = mutex.asyncLock();

  const { unlock: unlock1 } = await locked1Resolved;
  unlock1();

  const syncLock = mutex.lock();
  expect(syncLock).toBeDefined();

  setImmediate(() => {
    syncLock!.unlock();
  });

  const { unlock: unlock2 } = await locked2Resolved;
  unlock2();

  expect(mutex.isLocked()).toEqual(false);
});
