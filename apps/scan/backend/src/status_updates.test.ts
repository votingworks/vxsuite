import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { deferred } from '@votingworks/basics';
import {
  createStatusUpdates,
  STATUS_UPDATE_TIMEOUT_MS,
  type StatusUpdate,
} from './status_updates.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function createSource(initial: StatusUpdate['statuses']) {
  let statuses = initial;
  const listeners: Array<() => void> = [];
  return {
    getStatuses: () => Promise.resolve(statuses),
    subscribe: (listener: () => void) => {
      listeners.push(listener);
    },
    set(next: StatusUpdate['statuses']) {
      statuses = next;
      for (const listener of listeners) listener();
    },
  };
}

const noPaper: StatusUpdate['statuses'] = {
  scanner: {
    state: 'waiting_for_ballot',
    ballotsCounted: 0,
    lifetimeSheetsCounted: 0,
  },
};
const scanning: StatusUpdate['statuses'] = {
  scanner: { state: 'scanning', ballotsCounted: 0, lifetimeSheetsCounted: 0 },
};

test('returns the current statuses immediately without or with a stale revision', async () => {
  const updates = createStatusUpdates(createSource(noPaper));

  const first = await updates.next(undefined);
  expect(first.statuses).toEqual(noPaper);
  expect(await updates.next(first.revision - 1)).toEqual(first);
});

test('waits for the statuses to change', async () => {
  const source = createSource(noPaper);
  const updates = createStatusUpdates(source);
  const { revision } = await updates.next(undefined);

  const resolved = vi.fn();
  const pending = updates.next(revision).then(resolved);
  await vi.advanceTimersByTimeAsync(0);
  expect(resolved).not.toHaveBeenCalled();

  source.set({ ...noPaper });
  await vi.advanceTimersByTimeAsync(0);
  expect(resolved).not.toHaveBeenCalled();

  source.set(scanning);
  await pending;
  expect(resolved).toHaveBeenCalledWith({
    revision: revision + 1,
    statuses: scanning,
  });
});

test('gives up after the timeout', async () => {
  const updates = createStatusUpdates(createSource(noPaper));
  const { revision } = await updates.next(undefined);

  const pending = updates.next(revision);
  await vi.advanceTimersByTimeAsync(STATUS_UPDATE_TIMEOUT_MS);
  expect(await pending).toEqual({ revision, statuses: noPaper });
});

test('rereads on timeout to pick up changes made without a notification', async () => {
  let statuses = noPaper;
  const updates = createStatusUpdates({
    getStatuses: () => Promise.resolve(statuses),
    subscribe: () => {},
  });
  const { revision } = await updates.next(undefined);

  const resolved = vi.fn();
  const pending = updates.next(revision).then(resolved);
  await vi.advanceTimersByTimeAsync(0);
  statuses = scanning;
  await vi.advanceTimersByTimeAsync(STATUS_UPDATE_TIMEOUT_MS - 1);
  expect(resolved).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(1);
  await pending;
  expect(resolved).toHaveBeenCalledWith({
    revision: revision + 1,
    statuses: scanning,
  });
});

test('recovers from a failed read', async () => {
  const source = createSource(noPaper);
  const getStatuses = vi
    .fn(source.getStatuses)
    .mockRejectedValueOnce(new Error('disk I/O error'));
  const updates = createStatusUpdates({ ...source, getStatuses });

  await expect(updates.next(undefined)).rejects.toThrow('disk I/O error');
  expect((await updates.next(undefined)).statuses).toEqual(noPaper);
});

test('shares one read among concurrent waiters', async () => {
  const source = createSource(noPaper);
  const getStatuses = vi.fn(source.getStatuses);
  const updates = createStatusUpdates({ ...source, getStatuses });
  const { revision } = await updates.next(undefined);

  const waiters = [updates.next(revision), updates.next(revision)];
  await vi.advanceTimersByTimeAsync(0);
  getStatuses.mockClear();
  source.set(scanning);
  const [a, b] = await Promise.all(waiters);
  expect(a).toEqual({ revision: revision + 1, statuses: scanning });
  expect(b).toEqual(a);
  expect(getStatuses).toHaveBeenCalledTimes(1);
});

test('shares a newer in-flight read with a waiter whose read finished', async () => {
  const source = createSource(noPaper);
  const firstRead = deferred<StatusUpdate['statuses']>();
  const getStatuses = vi
    .fn(source.getStatuses)
    .mockReturnValueOnce(firstRead.promise);
  const updates = createStatusUpdates({ ...source, getStatuses });

  const first = updates.next(1);
  source.set({ ...noPaper });
  const second = updates.next(undefined);
  firstRead.resolve(noPaper);
  expect(await second).toEqual({ revision: 1, statuses: noPaper });
  expect(getStatuses).toHaveBeenCalledTimes(2);

  source.set(scanning);
  expect(await first).toEqual({ revision: 2, statuses: scanning });
  expect(getStatuses).toHaveBeenCalledTimes(3);
});

test('does not miss a change made while a read is in flight', async () => {
  const source = createSource(noPaper);
  const firstRead = deferred<StatusUpdate['statuses']>();
  const getStatuses = vi
    .fn(source.getStatuses)
    .mockReturnValueOnce(firstRead.promise);
  const updates = createStatusUpdates({ ...source, getStatuses });

  const pending = updates.next(1);
  source.set(scanning);
  firstRead.resolve(noPaper);
  expect(await pending).toEqual({ revision: 2, statuses: scanning });
});
