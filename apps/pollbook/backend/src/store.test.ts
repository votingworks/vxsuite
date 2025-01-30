import { assert, sleep } from '@votingworks/basics';
import { HybridLogicalClock } from './hybrid_logical_clock';
import {
  createVoter,
  createVoterCheckInEvent,
  getTestElection,
} from './test_helpers';
import { Store } from './store';

export const myMachineId = 'machine-1';
const otherMachineId = 'machine-2';

test('getNewEvents returns events for unknown machines', () => {
  const store = Store.memoryStore(myMachineId);
  const myHlcClock = new HybridLogicalClock(myMachineId);
  const theirHlcClock = new HybridLogicalClock(otherMachineId);
  const event1 = createVoterCheckInEvent(
    1,
    myMachineId,
    'voter-1',
    myHlcClock.tick()
  );
  const event2 = createVoterCheckInEvent(
    1,
    otherMachineId,
    'voter-2',
    theirHlcClock.tick()
  );

  store.saveEvent(event1);
  store.saveEvent(event2);

  const knownMachines: Record<string, number> = {};
  const { events, hasMore } = store.getNewEvents(knownMachines);

  assert(events.length === 2);
  expect(events).toEqual([event1, event2]);
  expect(hasMore).toEqual(false);
});

test('getNewEvents returns events for known machines with new events', () => {
  const store = Store.memoryStore(myMachineId);
  const myClock = new HybridLogicalClock(myMachineId);
  const theirClock = new HybridLogicalClock(otherMachineId);
  const event1 = createVoterCheckInEvent(
    1,
    myMachineId,
    'voter-1',
    myClock.tick()
  );
  const event2 = createVoterCheckInEvent(
    1,
    otherMachineId,
    'voter-2',
    theirClock.tick()
  );
  const event3 = createVoterCheckInEvent(
    2,
    myMachineId,
    'voter-3',
    myClock.tick()
  );

  store.saveEvent(event1);
  store.saveEvent(event2);
  store.saveEvent(event3);

  const knownMachines: Record<string, number> = {
    [myMachineId]: 1,
    [otherMachineId]: 1,
  };
  const { events, hasMore } = store.getNewEvents(knownMachines);

  assert(events.length === 1);
  expect(events).toEqual([event3]);
  expect(hasMore).toEqual(false);
});

test('getNewEvents returns no events for known machines and unknown machines', async () => {
  const store = Store.memoryStore(myMachineId);
  const myClock = new HybridLogicalClock(myMachineId);
  const theirClock = new HybridLogicalClock(otherMachineId);
  const event1 = createVoterCheckInEvent(
    1,
    myMachineId,
    'voter-1',
    myClock.tick()
  );
  const event2 = createVoterCheckInEvent(
    2,
    myMachineId,
    'voter-2',
    myClock.tick()
  );
  const event3 = createVoterCheckInEvent(
    3,
    myMachineId,
    'voter-3',
    myClock.tick()
  );
  const event4 = createVoterCheckInEvent(
    4,
    myMachineId,
    'voter-4',
    myClock.tick()
  );
  const event5 = createVoterCheckInEvent(
    5,
    myMachineId,
    'voter-5',
    myClock.tick()
  );
  await sleep(10);
  const event6 = createVoterCheckInEvent(
    1,
    otherMachineId,
    'voter-6',
    theirClock.tick()
  );
  const event7 = createVoterCheckInEvent(
    2,
    otherMachineId,
    'voter-7',
    theirClock.tick()
  );

  store.saveEvent(event1);
  store.saveEvent(event2);
  store.saveEvent(event3);
  store.saveEvent(event4);
  store.saveEvent(event5);
  store.saveEvent(event6);
  store.saveEvent(event7);

  const knownMachines: Record<string, number> = {
    [myMachineId]: 3,
    'not-a-machine': 1,
  };
  const { events, hasMore } = store.getNewEvents(knownMachines);

  assert(events.length === 4);
  expect(events).toEqual([event6, event7, event4, event5]); // order is not guaranteed to follow HLC
  expect(hasMore).toEqual(false);
});

test('getNewEvents returns hasMore when there are more events from unknown machines', () => {
  const store = Store.memoryStore(myMachineId);
  const store2 = Store.memoryStore('machine-2');
  const voters = Array.from({ length: 7 }, (_, i) =>
    createVoter(`voter-${i}`, 'firstname', 'lastname')
  );
  store2.setElectionAndVoters(getTestElection(), voters);
  const theirClock = new HybridLogicalClock(otherMachineId);
  const events = Array.from({ length: 7 }, (_, i) =>
    createVoterCheckInEvent(i, otherMachineId, `voter-${i}`, theirClock.tick())
  );

  for (const event of events) {
    store.saveEvent(event);
  }

  const { events: firstBatch, hasMore: firstHasMore } = store.getNewEvents(
    store2.getLastEventSyncedPerNode(), // empty
    5
  );
  store2.saveRemoteEvents(firstBatch);

  assert(firstBatch.length === 5);
  expect(firstBatch).toEqual(events.slice(0, 5));
  expect(firstHasMore).toEqual(true);

  expect(store2.getLastEventSyncedPerNode()).toEqual({
    [otherMachineId]: 4,
  });

  const { events: secondBatch, hasMore: secondHasMore } = store.getNewEvents(
    store2.getLastEventSyncedPerNode(),
    5
  );

  assert(secondBatch.length === 2);
  expect(secondBatch).toEqual(events.slice(5));
  expect(secondHasMore).toEqual(false);
});

test('getNewEvents returns hasMore when there are more events from known machines (no unknown machines)', () => {
  const store = Store.memoryStore(myMachineId);
  const store2 = Store.memoryStore('machine-2');
  const voters = Array.from({ length: 7 }, (_, i) =>
    createVoter(`voter-${i}`, 'firstname', 'lastname')
  );
  store2.setElectionAndVoters(getTestElection(), voters);
  const myClock = new HybridLogicalClock(myMachineId);
  const events = Array.from({ length: 7 }, (_, i) =>
    createVoterCheckInEvent(i, myMachineId, `voter-${i + 1}`, myClock.tick())
  );

  for (const event of events) {
    store.saveEvent(event);
  }

  // Set up store2 to have synced the first event only from myMachineId
  store2.saveRemoteEvents([events[0]]);
  expect(store2.getLastEventSyncedPerNode()).toEqual({ [myMachineId]: 0 });

  const { events: firstBatch, hasMore: firstHasMore } = store.getNewEvents(
    store2.getLastEventSyncedPerNode(),
    5
  );

  assert(firstBatch.length === 5);
  expect(firstBatch).toEqual(events.slice(1, 6));
  expect(firstHasMore).toEqual(true);

  store2.saveRemoteEvents(firstBatch);
  expect(store2.getLastEventSyncedPerNode()).toEqual({ [myMachineId]: 5 });

  const { events: secondBatch, hasMore: secondHasMore } = store.getNewEvents(
    store2.getLastEventSyncedPerNode(),
    5
  );

  assert(secondBatch.length === 1);
  expect(secondBatch).toEqual(events.slice(6));
  expect(secondHasMore).toEqual(false);
});

test('getNewEvents returns hasMore when there are more events from known machines and unknown machines combined', () => {
  const store = Store.memoryStore(myMachineId);
  const store2 = Store.memoryStore('test-machine');
  const voters = Array.from({ length: 10 }, (_, i) =>
    createVoter(`voter-${i}`, 'firstname', 'lastname')
  );
  store2.setElectionAndVoters(getTestElection(), voters);
  const myClock = new HybridLogicalClock(myMachineId);
  const theirClock = new HybridLogicalClock(otherMachineId);
  const machine1Events = Array.from({ length: 4 }, (_, i) =>
    createVoterCheckInEvent(i, myMachineId, `voter-${i + 1}`, myClock.tick())
  );
  const machine2Events = Array.from({ length: 3 }, (_, i) =>
    createVoterCheckInEvent(
      i,
      otherMachineId,
      `voter-${i + 5}`,
      theirClock.tick()
    )
  );

  for (const event of machine1Events) {
    store.saveEvent(event);
  }
  for (const event of machine2Events) {
    store.saveEvent(event);
  }

  // Set up store2 to have synced the first event only from myMachineId
  store2.saveRemoteEvents([machine1Events[0]]);
  expect(store2.getLastEventSyncedPerNode()).toEqual({ [myMachineId]: 0 });
  const { events: firstBatch, hasMore: firstHasMore } = store.getNewEvents(
    store2.getLastEventSyncedPerNode(),
    5
  );

  assert(firstBatch.length === 5);
  expect(firstBatch).toEqual([
    ...machine2Events,
    ...machine1Events.slice(1, 3),
  ]);
  expect(firstHasMore).toEqual(true);

  store2.saveRemoteEvents(firstBatch);
  expect(store2.getLastEventSyncedPerNode()).toEqual({
    [myMachineId]: 2,
    [otherMachineId]: 2,
  });

  const { events: secondBatch, hasMore: secondHasMore } = store.getNewEvents(
    store2.getLastEventSyncedPerNode(),
    5
  );

  assert(secondBatch.length === 1);
  expect(secondBatch).toEqual(machine1Events.slice(3));
  expect(secondHasMore).toEqual(false);
});
