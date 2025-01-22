import { assert } from '@votingworks/basics';
import { Store } from './store';
import { EventType, VectorClock, VoterCheckInEvent } from './types';

const myMachineId = 'machine-1';
const otherMachineId = 'machine-2';

function createTestStore(): Store {
  return Store.memoryStore(myMachineId);
}

function createVoterCheckInEvent(
  eventId: number,
  machineId: string,
  voterId: string,
  vectorClock: VectorClock
): VoterCheckInEvent {
  const timestamp = new Date().toISOString();
  return {
    type: EventType.VoterCheckIn,
    eventId,
    machineId,
    timestamp,
    voterId,
    vectorClock,
    checkInData: {
      timestamp,
      identificationMethod: {
        type: 'photoId',
        state: 'nh',
      },
      machineId,
    },
  };
}

test('getNewEvents returns events for unknown machines', () => {
  const store = createTestStore();
  const event1 = createVoterCheckInEvent(1, myMachineId, 'voter-1', {
    myMachineId: 1,
  });
  const event2 = createVoterCheckInEvent(2, otherMachineId, 'voter-2', {
    otherMachineId: 2,
  });

  store.saveEvent(event1);
  store.saveEvent(event2);

  const knownMachines: Record<string, number> = {};
  const events = store.getNewEvents(knownMachines);

  assert(events.length === 2);
  expect(events).toEqual([event1, event2]);
});

test('getNewEvents returns events for known machines with new events', () => {
  const store = createTestStore();
  const event1 = createVoterCheckInEvent(1, myMachineId, 'voter-1', {
    myMachineId: 1,
  });
  const event2 = createVoterCheckInEvent(2, otherMachineId, 'voter-2', {
    otherMachineId: 1,
  });
  const event3 = createVoterCheckInEvent(1, myMachineId, 'voter-3', {
    myMachineId: 2,
  });

  store.saveEvent(event1);
  store.saveEvent(event2);
  store.saveEvent(event3);

  const exampleClock: VectorClock = {
    [myMachineId]: 1,
    [otherMachineId]: 1,
  };
  const events = store.getNewEvents(exampleClock);

  assert(events.length === 1);
  expect(events).toEqual([event2]);
});

test('getNewEvents returns no events for known machines and unknown machines', () => {
  const store = createTestStore();
  const event1 = createVoterCheckInEvent(1, myMachineId, 'voter-1', {
    myMachineId: 1,
  });
  const event2 = createVoterCheckInEvent(2, myMachineId, 'voter-2', {
    myMachineId: 2,
  });
  const event3 = createVoterCheckInEvent(3, myMachineId, 'voter-3', {
    myMachineId: 3,
  });
  const event4 = createVoterCheckInEvent(4, myMachineId, 'voter-4', {
    myMachineId: 4,
  });
  const event5 = createVoterCheckInEvent(5, myMachineId, 'voter-5', {
    myMachineId: 5,
  });
  const event6 = createVoterCheckInEvent(1, otherMachineId, 'voter-6', {
    otherMachineId: 1,
  });
  const event7 = createVoterCheckInEvent(2, otherMachineId, 'voter-7', {
    otherMachineId: 2,
  });

  store.saveEvent(event1);
  store.saveEvent(event2);
  store.saveEvent(event3);
  store.saveEvent(event4);
  store.saveEvent(event5);
  store.saveEvent(event6);
  store.saveEvent(event7);

  const knownMachines: VectorClock = {
    [myMachineId]: 3,
    'not-a-machine': 1,
  };
  const events = store.getNewEvents(knownMachines);

  assert(events.length === 4);
  expect(events).toEqual([event6, event7, event4, event5]);
});
