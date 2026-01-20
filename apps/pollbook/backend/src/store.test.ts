import { describe, expect, test, vi } from 'vitest';
import { assert, sleep } from '@votingworks/basics';
import { mockBaseLogger } from '@votingworks/logging';
import { HybridLogicalClock } from './hybrid_logical_clock';
import {
  createTestPeerStore,
  createUndoCheckInEvent,
  createVoter,
  createVoterCheckInEvent,
  getTestElectionDefinition,
} from '../test/test_helpers';
import { PeerStore } from './peer_store';
import {
  sortedByVoterName,
  sortedByVoterNameAndMatchingPrecinct,
} from './store';
import { DuplicateCheckInDetailsDb } from './types';

export const myMachineId = 'machine-1';
const otherMachineId = 'machine-2';

function setupTwoStores(): [PeerStore, PeerStore] {
  const store1 = PeerStore.memoryStore(
    mockBaseLogger({ fn: vi.fn }),
    myMachineId
  );
  const store2 = PeerStore.memoryStore(
    mockBaseLogger({ fn: vi.fn }),
    otherMachineId
  );
  const voters = Array.from({ length: 7 }, (_, i) =>
    createVoter(`voter-${i}`, 'firstname', 'lastname')
  );
  const testElection = getTestElectionDefinition();
  for (const store of [store1, store2]) {
    store.setElectionAndVoters(testElection, 'mock-package-hash', [], voters);
    store.setConfiguredPrecinct(testElection.election.precincts[0].id);
  }
  return [store1, store2];
}

test('getNewEvents returns events for unknown machines', () => {
  const store = PeerStore.memoryStore(
    mockBaseLogger({ fn: vi.fn }),
    myMachineId
  );
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
  const store = PeerStore.memoryStore(
    mockBaseLogger({ fn: vi.fn }),
    myMachineId
  );
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
  const store = PeerStore.memoryStore(
    mockBaseLogger({ fn: vi.fn }),
    myMachineId
  );
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
  const [store, store2] = setupTwoStores();

  const theirClock = new HybridLogicalClock(otherMachineId);
  const events = Array.from({ length: 7 }, (_, i) =>
    createVoterCheckInEvent(i, otherMachineId, `voter-${i}`, theirClock.tick())
  );

  for (const event of events) {
    store.saveEvent(event);
  }

  const { events: firstBatch, hasMore: firstHasMore } = store.getNewEvents(
    store2.getMostRecentEventIdPerMachine(), // empty
    5
  );
  store2.saveRemoteEvents(
    firstBatch,
    store.getPollbookConfigurationInformation()
  );

  assert(firstBatch.length === 5);
  expect(firstBatch).toEqual(events.slice(0, 5));
  expect(firstHasMore).toEqual(true);

  expect(store2.getMostRecentEventIdPerMachine()).toEqual({
    [otherMachineId]: 4,
  });

  const { events: secondBatch, hasMore: secondHasMore } = store.getNewEvents(
    store2.getMostRecentEventIdPerMachine(),
    5
  );

  assert(secondBatch.length === 2);
  expect(secondBatch).toEqual(events.slice(5));
  expect(secondHasMore).toEqual(false);
});

test('getNewEvents returns hasMore when there are more events from known machines (no unknown machines)', () => {
  const [store, store2] = setupTwoStores();
  const myClock = new HybridLogicalClock(myMachineId);
  const events = Array.from({ length: 7 }, (_, i) =>
    createVoterCheckInEvent(i, myMachineId, `voter-${i + 1}`, myClock.tick())
  );

  for (const event of events) {
    store.saveEvent(event);
  }

  // Set up store2 to have synced the first event only from myMachineId
  store2.saveRemoteEvents(
    [events[0]],
    store.getPollbookConfigurationInformation()
  );
  expect(store2.getMostRecentEventIdPerMachine()).toEqual({ [myMachineId]: 0 });

  const { events: firstBatch, hasMore: firstHasMore } = store.getNewEvents(
    store2.getMostRecentEventIdPerMachine(),
    5
  );

  assert(firstBatch.length === 5);
  expect(firstBatch).toEqual(events.slice(1, 6));
  expect(firstHasMore).toEqual(true);

  store2.saveRemoteEvents(
    firstBatch,
    store.getPollbookConfigurationInformation()
  );
  expect(store2.getMostRecentEventIdPerMachine()).toEqual({ [myMachineId]: 5 });

  const { events: secondBatch, hasMore: secondHasMore } = store.getNewEvents(
    store2.getMostRecentEventIdPerMachine(),
    5
  );

  assert(secondBatch.length === 1);
  expect(secondBatch).toEqual(events.slice(6));
  expect(secondHasMore).toEqual(false);
});

test('getNewEvents returns hasMore when there are more events from known machines and unknown machines combined', () => {
  const [store, store2] = setupTwoStores();
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
  store2.saveRemoteEvents(
    [machine1Events[0]],
    store.getPollbookConfigurationInformation()
  );
  expect(store2.getMostRecentEventIdPerMachine()).toEqual({ [myMachineId]: 0 });
  const { events: firstBatch, hasMore: firstHasMore } = store.getNewEvents(
    store2.getMostRecentEventIdPerMachine(),
    5
  );

  assert(firstBatch.length === 5);
  expect(firstBatch).toEqual([
    ...machine2Events,
    ...machine1Events.slice(1, 3),
  ]);
  expect(firstHasMore).toEqual(true);

  store2.saveRemoteEvents(
    firstBatch,
    store.getPollbookConfigurationInformation()
  );
  expect(store2.getMostRecentEventIdPerMachine()).toEqual({
    [myMachineId]: 2,
    [otherMachineId]: 2,
  });

  const { events: secondBatch, hasMore: secondHasMore } = store.getNewEvents(
    store2.getMostRecentEventIdPerMachine(),
    5
  );

  assert(secondBatch.length === 1);
  expect(secondBatch).toEqual(machine1Events.slice(3));
  expect(secondHasMore).toEqual(false);
});

test('sortedByVoterName sorts voters alphabetically by last name, then first name', () => {
  const voters = [
    createVoter('voter-1', 'Charlie', 'Brown'),
    createVoter('voter-2', 'Alice', 'Brown'),
    createVoter('voter-3', 'Bob', 'Adams'),
    createVoter('voter-4', 'Alice', 'Adams'),
  ];

  const sorted = sortedByVoterName(voters);

  expect(sorted.map((v) => `${v.firstName} ${v.lastName}`)).toEqual([
    'Alice Adams',
    'Bob Adams',
    'Alice Brown',
    'Charlie Brown',
  ]);
});

test('sortedByVoterName respects useOriginalName option', () => {
  const voters = [
    createVoter('voter-1', 'Charlie', 'Brown'),
    createVoter('voter-2', 'Alice', 'Brown'),
  ];

  // Add name change to first voter
  voters[0].nameChange = {
    firstName: 'Charles',
    lastName: 'Smith',
    middleName: '',
    suffix: '',
    timestamp: '2025-01-01T00:00:00.000Z',
  };

  // Sort with changed names (default behavior)
  const sortedWithChanges = sortedByVoterName(voters);
  expect(sortedWithChanges.map((v) => `${v.firstName} ${v.lastName}`)).toEqual([
    'Alice Brown',
    'Charlie Brown', // Shows original name since we're displaying original
  ]);

  // Sort with original names only
  const sortedOriginal = sortedByVoterName(voters, { useOriginalName: true });
  expect(sortedOriginal.map((v) => `${v.firstName} ${v.lastName}`)).toEqual([
    'Alice Brown',
    'Charlie Brown',
  ]);
});

test('sortedByVoterNameAndMatchingPrecinct returns regular sort when no configured precinct', () => {
  const voters = [
    createVoter('voter-1', 'Charlie', 'Brown'),
    createVoter('voter-2', 'Alice', 'Brown'),
    createVoter('voter-3', 'Bob', 'Adams'),
  ];

  const sorted = sortedByVoterNameAndMatchingPrecinct(voters);
  const regularSorted = sortedByVoterName(voters);

  expect(sorted).toEqual(regularSorted);
});

test('sortedByVoterNameAndMatchingPrecinct puts matching precinct voters first', () => {
  const voters = [
    { ...createVoter('voter-1', 'Charlie', 'Brown'), precinct: 'precinct-2' },
    { ...createVoter('voter-2', 'Alice', 'Brown'), precinct: 'precinct-1' },
    { ...createVoter('voter-3', 'Bob', 'Adams'), precinct: 'precinct-2' },
    { ...createVoter('voter-4', 'Dave', 'Adams'), precinct: 'precinct-1' },
  ];

  const sorted = sortedByVoterNameAndMatchingPrecinct(voters, 'precinct-1');

  // Should get matching precinct voters first (sorted), then non-matching (sorted)
  expect(
    sorted.map((v) => `${v.firstName} ${v.lastName} (${v.precinct})`)
  ).toEqual([
    'Dave Adams (precinct-1)',
    'Alice Brown (precinct-1)',
    'Bob Adams (precinct-2)',
    'Charlie Brown (precinct-2)',
  ]);
});

test('sortedByVoterNameAndMatchingPrecinct considers address changes for precinct matching', () => {
  const voters = [
    { ...createVoter('voter-1', 'Charlie', 'Brown'), precinct: 'precinct-2' },
    { ...createVoter('voter-2', 'Alice', 'Brown'), precinct: 'precinct-2' },
    { ...createVoter('voter-3', 'Bob', 'Adams'), precinct: 'precinct-1' },
  ];

  // Add address change to first voter that changes their precinct
  voters[0].addressChange = {
    streetNumber: '456',
    streetName: 'Oak St',
    streetSuffix: '',
    apartmentUnitNumber: '',
    houseFractionNumber: '',
    addressLine2: '',
    addressLine3: '',
    city: 'Manchester',
    state: 'NH',
    zipCode: '03101',
    precinct: 'precinct-1',
    timestamp: '2025-01-01T00:00:00.000Z',
  };

  const sorted = sortedByVoterNameAndMatchingPrecinct(voters, 'precinct-1');

  // Charlie should be in matching group due to address change
  expect(
    sorted.map(
      (v) =>
        `${v.firstName} ${v.lastName} (${
          v.addressChange?.precinct || v.precinct
        })`
    )
  ).toEqual([
    'Bob Adams (precinct-1)',
    'Charlie Brown (precinct-1)',
    'Alice Brown (precinct-2)',
  ]);
});

test('sortedByVoterNameAndMatchingPrecinct respects useOriginalName option', () => {
  const voters = [
    { ...createVoter('voter-1', 'Charlie', 'Brown'), precinct: 'precinct-1' },
    { ...createVoter('voter-2', 'Alice', 'Brown'), precinct: 'precinct-2' },
  ];

  // Add name change to first voter
  voters[0].nameChange = {
    firstName: 'Charles',
    lastName: 'Smith',
    middleName: '',
    suffix: '',
    timestamp: '2025-01-01T00:00:00.000Z',
  };

  const sorted = sortedByVoterNameAndMatchingPrecinct(voters, 'precinct-1', {
    useOriginalName: true,
  });

  // Should still put matching precinct first, and use original names for sorting
  expect(
    sorted.map((v) => `${v.firstName} ${v.lastName} (${v.precinct})`)
  ).toEqual(['Charlie Brown (precinct-1)', 'Alice Brown (precinct-2)']);
});

describe('Anomaly Management - Store Methods', () => {
  describe('recordAnomaly', () => {
    test('stores anomaly in database with correct fields', () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });
      const anomalyDetails: DuplicateCheckInDetailsDb = {
        voterId: 'voter-1',
        checkInEvents: [
          { machineId: 'machine-1', timestamp: '2024-01-01T10:00:00.000Z' },
          { machineId: 'machine-2', timestamp: '2024-01-01T10:01:00.000Z' },
        ],
      };

      store.recordAnomaly('DuplicateCheckIn', anomalyDetails);

      const anomalies = store.getActiveAnomalies();
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].anomalyType).toEqual('DuplicateCheckIn');
      expect(anomalies[0].dismissed).toEqual(false);
      expect(anomalies[0].dismissedAt).toBeUndefined();
      expect(anomalies[0].anomalyDetails.voterId).toEqual('voter-1');
      expect(anomalies[0].anomalyDetails.checkInEvents).toHaveLength(2);
    });

    test('sets detected_at to current time', () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });
      const beforeTime = Date.now();

      store.recordAnomaly('DuplicateCheckIn', {
        voterId: 'voter-1',
        checkInEvents: [
          { machineId: 'machine-1', timestamp: '2024-01-01T10:00:00.000Z' },
        ],
      });

      const afterTime = Date.now();
      const anomalies = store.getActiveAnomalies();
      expect(anomalies[0].detectedAt.getTime()).toBeGreaterThanOrEqual(
        beforeTime
      );
      expect(anomalies[0].detectedAt.getTime()).toBeLessThanOrEqual(afterTime);
    });

    test('can record multiple anomalies', () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });

      store.recordAnomaly('DuplicateCheckIn', {
        voterId: 'voter-1',
        checkInEvents: [
          { machineId: 'machine-1', timestamp: '2024-01-01T10:00:00.000Z' },
        ],
      });

      store.recordAnomaly('DuplicateCheckIn', {
        voterId: 'voter-2',
        checkInEvents: [
          { machineId: 'machine-1', timestamp: '2024-01-01T10:05:00.000Z' },
        ],
      });

      const anomalies = store.getActiveAnomalies();
      expect(anomalies).toHaveLength(2);
    });
  });

  describe('getActiveAnomalies', () => {
    test('returns empty array when no anomalies exist', () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });
      const anomalies = store.getActiveAnomalies();
      expect(anomalies).toEqual([]);
    });

    test('returns only non-dismissed anomalies', () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });

      store.recordAnomaly('DuplicateCheckIn', {
        voterId: 'voter-1',
        checkInEvents: [],
      });
      store.recordAnomaly('DuplicateCheckIn', {
        voterId: 'voter-2',
        checkInEvents: [],
      });

      const anomalies = store.getActiveAnomalies();
      expect(anomalies).toHaveLength(2);

      // Find and dismiss the voter-1 anomaly
      const voter1Anomaly = anomalies.find(
        (a) => a.anomalyDetails.voterId === 'voter-1'
      );
      expect(voter1Anomaly).toBeDefined();
      store.dismissAnomaly(voter1Anomaly!.anomalyId);

      const activeAnomalies = store.getActiveAnomalies();
      expect(activeAnomalies).toHaveLength(1);
      expect(activeAnomalies[0].anomalyDetails.voterId).toEqual('voter-2');
    });

    test('returns anomalies ordered by detected_at DESC (most recent first)', async () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });

      store.recordAnomaly('DuplicateCheckIn', {
        voterId: 'voter-1',
        checkInEvents: [],
      });

      await sleep(10);

      store.recordAnomaly('DuplicateCheckIn', {
        voterId: 'voter-2',
        checkInEvents: [],
      });

      const anomalies = store.getActiveAnomalies();
      expect(anomalies).toHaveLength(2);
      // Most recent first
      expect(anomalies[0].anomalyDetails.voterId).toEqual('voter-2');
      expect(anomalies[1].anomalyDetails.voterId).toEqual('voter-1');
      expect(anomalies[0].detectedAt.getTime()).toBeGreaterThan(
        anomalies[1].detectedAt.getTime()
      );
    });

    test('enriches anomaly with full voter object', () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });

      store.recordAnomaly('DuplicateCheckIn', {
        voterId: 'voter-1',
        checkInEvents: [
          { machineId: 'machine-1', timestamp: '2024-01-01T10:00:00.000Z' },
        ],
      });

      const anomalies = store.getActiveAnomalies();
      expect(anomalies[0].anomalyDetails.voter).toBeDefined();
      expect(anomalies[0].anomalyDetails.voter.voterId).toEqual('voter-1');
      expect(anomalies[0].anomalyDetails.voter.firstName).toEqual('FirstName1');
      expect(anomalies[0].anomalyDetails.voter.lastName).toEqual('LastName1');
    });

    test('converts timestamp integers to Date objects', () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });

      store.recordAnomaly('DuplicateCheckIn', {
        voterId: 'voter-1',
        checkInEvents: [],
      });

      const anomalies = store.getActiveAnomalies();
      expect(anomalies[0].detectedAt).toBeInstanceOf(Date);
    });
  });

  describe('dismissAnomaly', () => {
    test('marks anomaly as dismissed', () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });

      store.recordAnomaly('DuplicateCheckIn', {
        voterId: 'voter-1',
        checkInEvents: [],
      });

      const anomalies = store.getActiveAnomalies();
      expect(anomalies).toHaveLength(1);

      store.dismissAnomaly(anomalies[0].anomalyId);

      const activeAnomalies = store.getActiveAnomalies();
      expect(activeAnomalies).toHaveLength(0);
    });

    test('dismissing non-existent anomaly does not throw', () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });
      expect(() => store.dismissAnomaly(999999)).not.toThrow();
    });

    test('dismissed anomaly no longer appears in getActiveAnomalies', () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });

      store.recordAnomaly('DuplicateCheckIn', {
        voterId: 'voter-1',
        checkInEvents: [],
      });
      store.recordAnomaly('DuplicateCheckIn', {
        voterId: 'voter-2',
        checkInEvents: [],
      });
      store.recordAnomaly('DuplicateCheckIn', {
        voterId: 'voter-3',
        checkInEvents: [],
      });

      const allAnomalies = store.getActiveAnomalies();
      expect(allAnomalies).toHaveLength(3);

      // Dismiss the middle one (voter-2)
      const voter2Anomaly = allAnomalies.find(
        (a) => a.anomalyDetails.voterId === 'voter-2'
      );
      expect(voter2Anomaly).toBeDefined();
      store.dismissAnomaly(voter2Anomaly!.anomalyId);

      const remainingAnomalies = store.getActiveAnomalies();
      expect(remainingAnomalies).toHaveLength(2);
      expect(
        remainingAnomalies.find((a) => a.anomalyDetails.voterId === 'voter-2')
      ).toBeUndefined();
    });
  });
});

describe('Duplicate Check-In Detection', () => {
  describe('single machine scenarios', () => {
    test('single check-in does not create anomaly', () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });
      const clock = new HybridLogicalClock(myMachineId);

      const event = createVoterCheckInEvent(
        1,
        myMachineId,
        'voter-1',
        clock.tick()
      );
      store.saveEvent(event);

      const anomalies = store.getActiveAnomalies();
      expect(anomalies).toHaveLength(0);
    });

    test('two check-ins for same voter creates anomaly', async () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });
      const clock = new HybridLogicalClock(myMachineId);

      const event1 = createVoterCheckInEvent(
        1,
        myMachineId,
        'voter-1',
        clock.tick()
      );
      store.saveEvent(event1);

      await sleep(10);

      const event2 = createVoterCheckInEvent(
        2,
        myMachineId,
        'voter-1',
        clock.tick()
      );
      store.saveEvent(event2);

      const anomalies = store.getActiveAnomalies();
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].anomalyType).toEqual('DuplicateCheckIn');
      expect(anomalies[0].anomalyDetails.voterId).toEqual('voter-1');
      expect(anomalies[0].anomalyDetails.checkInEvents).toHaveLength(2);
    });

    test('check-ins for different voters do not create anomaly', () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });
      const clock = new HybridLogicalClock(myMachineId);

      store.saveEvent(
        createVoterCheckInEvent(1, myMachineId, 'voter-1', clock.tick())
      );
      store.saveEvent(
        createVoterCheckInEvent(2, myMachineId, 'voter-2', clock.tick())
      );
      store.saveEvent(
        createVoterCheckInEvent(3, myMachineId, 'voter-3', clock.tick())
      );

      const anomalies = store.getActiveAnomalies();
      expect(anomalies).toHaveLength(0);
    });

    test('three check-ins for same voter records all events in anomaly', async () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });
      const clock = new HybridLogicalClock(myMachineId);

      store.saveEvent(
        createVoterCheckInEvent(1, myMachineId, 'voter-1', clock.tick())
      );
      await sleep(5);
      store.saveEvent(
        createVoterCheckInEvent(2, myMachineId, 'voter-1', clock.tick())
      );
      await sleep(5);
      store.saveEvent(
        createVoterCheckInEvent(3, myMachineId, 'voter-1', clock.tick())
      );

      const anomalies = store.getActiveAnomalies();
      // Each duplicate creates a new anomaly when detected
      expect(anomalies.length).toBeGreaterThanOrEqual(1);

      // The most recent anomaly should have all check-in events
      const latestAnomaly = anomalies[0];
      expect(latestAnomaly.anomalyDetails.checkInEvents).toHaveLength(3);
    });
  });

  describe('undo check-in behavior', () => {
    test('check-in after undo does not create anomaly', () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });
      const clock = new HybridLogicalClock(myMachineId);

      // First check-in
      store.saveEvent(
        createVoterCheckInEvent(1, myMachineId, 'voter-1', clock.tick())
      );

      // Undo the check-in
      store.saveEvent(
        createUndoCheckInEvent(100, myMachineId, 'voter-1', clock.tick())
      );

      // Check-in again
      store.saveEvent(
        createVoterCheckInEvent(2, myMachineId, 'voter-1', clock.tick())
      );

      const anomalies = store.getActiveAnomalies();
      expect(anomalies).toHaveLength(0);
    });

    test('two check-ins after undo creates anomaly', async () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });
      const clock = new HybridLogicalClock(myMachineId);

      // First check-in
      store.saveEvent(
        createVoterCheckInEvent(1, myMachineId, 'voter-1', clock.tick())
      );

      // Undo the check-in
      store.saveEvent(
        createUndoCheckInEvent(100, myMachineId, 'voter-1', clock.tick())
      );

      // Check-in again (should be fine)
      store.saveEvent(
        createVoterCheckInEvent(2, myMachineId, 'voter-1', clock.tick())
      );

      await sleep(5);

      // Another check-in (should trigger anomaly)
      store.saveEvent(
        createVoterCheckInEvent(3, myMachineId, 'voter-1', clock.tick())
      );

      const anomalies = store.getActiveAnomalies();
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].anomalyDetails.checkInEvents).toHaveLength(2);
    });

    test('undo clears duplicate detection state', () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });
      const clock = new HybridLogicalClock(myMachineId);

      // First check-in
      store.saveEvent(
        createVoterCheckInEvent(1, myMachineId, 'voter-1', clock.tick())
      );

      // Second check-in (creates anomaly)
      store.saveEvent(
        createVoterCheckInEvent(2, myMachineId, 'voter-1', clock.tick())
      );

      expect(store.getActiveAnomalies()).toHaveLength(1);

      // Undo
      store.saveEvent(
        createUndoCheckInEvent(100, myMachineId, 'voter-1', clock.tick())
      );

      // Single new check-in after undo should not create NEW anomaly
      // (old anomaly still exists)
      const anomaliesBefore = store.getActiveAnomalies().length;
      store.saveEvent(
        createVoterCheckInEvent(3, myMachineId, 'voter-1', clock.tick())
      );
      const anomaliesAfter = store.getActiveAnomalies().length;

      // No new anomaly should be created
      expect(anomaliesAfter).toEqual(anomaliesBefore);
    });
  });

  describe('anomaly details', () => {
    test('anomaly contains correct voter ID', () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });
      const clock = new HybridLogicalClock(myMachineId);

      store.saveEvent(
        createVoterCheckInEvent(1, myMachineId, 'voter-5', clock.tick())
      );
      store.saveEvent(
        createVoterCheckInEvent(2, myMachineId, 'voter-5', clock.tick())
      );

      const anomalies = store.getActiveAnomalies();
      expect(anomalies[0].anomalyDetails.voterId).toEqual('voter-5');
    });

    test('anomaly includes voter details', () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });
      const clock = new HybridLogicalClock(myMachineId);

      store.saveEvent(
        createVoterCheckInEvent(1, myMachineId, 'voter-3', clock.tick())
      );
      store.saveEvent(
        createVoterCheckInEvent(2, myMachineId, 'voter-3', clock.tick())
      );

      const anomalies = store.getActiveAnomalies();
      const { voter } = anomalies[0].anomalyDetails;
      expect(voter.voterId).toEqual('voter-3');
      expect(voter.firstName).toEqual('FirstName3');
      expect(voter.lastName).toEqual('LastName3');
    });

    test('check-in events include machine ID and timestamp', () => {
      const store = createTestPeerStore(mockBaseLogger({ fn: vi.fn }), {
        machineId: myMachineId,
      });
      const clock = new HybridLogicalClock(myMachineId);

      store.saveEvent(
        createVoterCheckInEvent(1, myMachineId, 'voter-1', clock.tick())
      );
      store.saveEvent(
        createVoterCheckInEvent(2, myMachineId, 'voter-1', clock.tick())
      );

      const anomalies = store.getActiveAnomalies();
      const { checkInEvents } = anomalies[0].anomalyDetails;

      for (const event of checkInEvents) {
        expect(event.machineId).toEqual(myMachineId);
        expect(event.timestamp).toBeDefined();
        expect(typeof event.timestamp).toEqual('string');
      }
    });
  });
});
