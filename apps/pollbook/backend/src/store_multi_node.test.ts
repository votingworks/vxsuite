import { sleep } from '@votingworks/basics';
import { Store } from './store';
import {
  createVoter,
  getTestElection,
  syncEventsForAllPollbooks,
  syncEventsFromTo,
} from './test_helpers';
import { Voter } from './types';

// Multi-Node test for the following scenario:
// - PollbookA comes online
// - PollbookB comes online
// - PollbookA finds and connects/sync with PollbookB
// - PollbookB finds and connects/sync with PollbookA
// - Bob checks in on PollbookA
// - Charlie checks in on PollbookB
// - PollbookB syncs with PollbookA for latest events
// - PollbookA syncs with PollbookB for latest events
// - PollbookB goes offline
// - While offline Sue checks in on PollbookB
// - While offline the Sue check in is "undone" on PollbookB
// - Several real-world minutes later Sue checks in on PollbookA
// - PollbookB comes back online and resyncs with PollbookA
// - PollbookA refinds and resyncs with PollbookB
// Desired State: PollbookA and B both see Bob, Charlie and Sue as checked in with the check in for Sue coming from PollbookA
test('offline undo with later real time check in', async () => {
  // Set up two pollbook nodes
  const pollbookA = Store.memoryStore('pollbook-a');
  const pollbookB = Store.memoryStore('pollbook-b');

  // Set up test election and voters
  const testElection = getTestElection();
  const testVoters = [
    createVoter('bob', 'Bob', 'Smith'),
    createVoter('charlie', 'Charlie', 'Brown'),
    createVoter('sue', 'Sue', 'Jones'),
  ];

  // Initialize both pollbooks with same election data
  pollbookA.setElectionAndVoters(testElection, [], testVoters);
  pollbookB.setElectionAndVoters(testElection, [], testVoters);

  // Both pollbooks come online
  pollbookA.setOnlineStatus(true);
  pollbookB.setOnlineStatus(true);

  // Bob checks in on PollbookA
  pollbookA.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'photoId', state: 'nh' },
  });
  expect(pollbookA.getCheckInCount()).toEqual(1);

  // Charlie checks in on PollbookB
  pollbookB.recordVoterCheckIn({
    voterId: 'charlie',
    identificationMethod: { type: 'photoId', state: 'al' },
  });
  expect(pollbookB.getCheckInCount()).toEqual(1);

  // Pollbook B syncs with Pollbook A
  const eventsForB = syncEventsFromTo(pollbookA, pollbookB);
  expect(eventsForB.length).toEqual(1);

  // Pollbook A syncs with Pollbook B
  const eventsForA = syncEventsFromTo(pollbookB, pollbookA);
  expect(eventsForA.length).toEqual(1);

  // Verify both pollbooks see Bob and Charlie checked in
  expect(pollbookA.getCheckInCount()).toEqual(2);
  expect(pollbookB.getCheckInCount()).toEqual(2);

  // PollbookB goes offline
  pollbookB.setOnlineStatus(false);

  // Sue checks in with a CA id and then is undone on PollbookB while offline
  pollbookB.recordVoterCheckIn({
    voterId: 'sue',
    identificationMethod: { type: 'photoId', state: 'ca' },
  });
  pollbookB.recordUndoVoterCheckIn('sue');

  // Wait a bit to ensure physical timestamps will be different
  await sleep(10);

  // Sue checks in on PollbookA
  pollbookA.recordVoterCheckIn({
    voterId: 'sue',
    identificationMethod: { type: 'photoId', state: 'nh' },
  });

  // PollbookB comes back online
  pollbookB.setOnlineStatus(true);

  // Pollbook B syncs with Pollbook A
  const finalEventsForB = syncEventsFromTo(pollbookA, pollbookB);
  expect(finalEventsForB.length).toEqual(1);

  // Pollbook A sync with Pollbook B
  const finalEventsForA = syncEventsFromTo(pollbookB, pollbookA);
  expect(finalEventsForA.length).toEqual(2);

  // Verify final state
  // Both pollbooks should see all three voters checked in
  expect(pollbookA.getCheckInCount()).toEqual(3);
  expect(pollbookB.getCheckInCount()).toEqual(3);

  // Verify Sue's check-in is from PollbookA with NH id.
  const voters = pollbookA.searchVoters({ firstName: 'Sue', lastName: '' });
  expect((voters as Voter[]).length).toEqual(1);
  expect((voters as Voter[])[0].checkIn).toEqual({
    timestamp: expect.any(String),
    identificationMethod: { type: 'photoId', state: 'nh' },
    machineId: 'pollbook-a',
    isAbsentee: false,
  });
});

// - PollbookA comes online - the system clock is configured wrong for 8:00am
// - PollbookB comes online - the system clock is configured correct for 9:00am
// - Bob checks in on PollbookB
// - PollbookA syncs events from PollbookB
// - The bob check in is "undone" on PollbookA
// - PollbookB syncs events from PollbookA
// Desired scenario: The bob check in is marked as undone even though the system clock of that event will have happened before the original check in
test('bad system time nodes should be able to undo', () => {
  jest.useFakeTimers();

  // Set up two pollbook nodes
  const pollbookA = Store.memoryStore('pollbook-a');
  const pollbookB = Store.memoryStore('pollbook-b');

  // Set up test election and voters
  const testElection = getTestElection();
  const testVoters = [createVoter('bob', 'Bob', 'Smith')];

  // Initialize both pollbooks with same election data
  pollbookA.setElectionAndVoters(testElection, [], testVoters);
  pollbookB.setElectionAndVoters(testElection, [], testVoters);

  // Both pollbooks come online
  pollbookA.setOnlineStatus(true);
  pollbookB.setOnlineStatus(true);

  // Set time to 9am for PollbookB's check-in
  const nineAm = new Date('2024-01-01T09:00:00Z').getTime();
  jest.setSystemTime(nineAm);

  // Bob checks in on PollbookB (with correct time)
  pollbookB.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'photoId', state: 'nh' },
  });
  expect(pollbookB.getCheckInCount()).toEqual(1);

  // PollbookA syncs events from PollbookB
  const eventsForA = syncEventsFromTo(pollbookB, pollbookA);
  expect(eventsForA.length).toEqual(1);
  expect(pollbookA.getCheckInCount()).toEqual(1);

  // Set time back to 8am for PollbookA's undo operation
  const eightAm = new Date('2024-01-01T08:00:00Z').getTime();
  jest.setSystemTime(eightAm);

  // The bob check in is undone on PollbookA (with wrong time)
  pollbookA.recordUndoVoterCheckIn('bob');
  expect(pollbookA.getCheckInCount()).toEqual(0);

  // PollbookB syncs events from PollbookA
  const eventsForB = syncEventsFromTo(pollbookA, pollbookB);
  expect(eventsForB.length).toEqual(1);

  // Verify final state - Bob should be marked as NOT checked in on both machines
  // even though the undo event has an earlier timestamp
  expect(pollbookA.getCheckInCount()).toEqual(0);
  expect(pollbookB.getCheckInCount()).toEqual(0);

  // Verify Bob's status specifically
  const votersA = pollbookA.searchVoters({ firstName: 'Bob', lastName: '' });
  const votersB = pollbookB.searchVoters({ firstName: 'Bob', lastName: '' });
  expect((votersA as Voter[])[0].checkIn).toBeUndefined();
  expect((votersB as Voter[])[0].checkIn).toBeUndefined();

  jest.useRealTimers();
});

// Pollbook A and B and C are created. Each checks in a different voter and they all sync events.
// Pollbook C goes offline checks in Carl a few moments later
// Pollbook A and B check in more voters and sync events at a time later then the Carl check in
// Pollbook B is shutdown.
// Pollbook C rejoins the network. Pollbook A and C sync events. A should now have the Carl check in.
// Pollbook C is shutdown.
// Pollbook B rejoins the network. Pollbook A and B sync events. B should now have the Carl check in.

// This test is particularly complex because Pollbook B last synced with Pollbook A AFTER the event occurred on Pollbook C that it now needs from Pollbook A.

test("getting a offline machines events when I've synced with the online machine more recently", async () => {
  // Set up three pollbook nodes
  const pollbookA = Store.memoryStore('pollbook-a');
  const pollbookB = Store.memoryStore('pollbook-b');
  const pollbookC = Store.memoryStore('pollbook-c');

  // Set up test election and voters
  const testElection = getTestElection();
  const testVoters = [
    createVoter('alice', 'Alice', 'Wonderland'),
    createVoter('bob', 'Bob', 'Builder'),
    createVoter('carl', 'Carl', 'Sagan'),
    createVoter('sue', 'Sue', 'Jones'),
    createVoter('dave', 'Dave', 'Smith'),
    createVoter('eve', 'Eve', 'Johnson'),
  ];

  // Initialize all pollbooks with same election data
  pollbookA.setElectionAndVoters(testElection, [], testVoters);
  pollbookB.setElectionAndVoters(testElection, [], testVoters);
  pollbookC.setElectionAndVoters(testElection, [], testVoters);

  // All pollbooks come online
  pollbookA.setOnlineStatus(true);
  pollbookB.setOnlineStatus(true);
  pollbookC.setOnlineStatus(true);

  // Alice checks in on PollbookA
  pollbookA.recordVoterCheckIn({
    voterId: 'alice',
    identificationMethod: { type: 'photoId', state: 'nh' },
  });
  expect(pollbookA.getCheckInCount()).toEqual(1);

  // Bob checks in on PollbookB
  pollbookB.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'photoId', state: 'nh' },
  });
  expect(pollbookB.getCheckInCount()).toEqual(1);

  // Carl checks in on PollbookC
  pollbookC.recordVoterCheckIn({
    voterId: 'carl',
    identificationMethod: { type: 'photoId', state: 'nh' },
  });
  expect(pollbookC.getCheckInCount()).toEqual(1);

  // Sync events between all pollbooks
  syncEventsForAllPollbooks([pollbookA, pollbookB, pollbookC]);

  // Verify all pollbooks see Alice, Bob, and Carl checked in
  expect(pollbookA.getCheckInCount()).toEqual(3);
  expect(pollbookB.getCheckInCount()).toEqual(3);
  expect(pollbookC.getCheckInCount()).toEqual(3);

  // PollbookC goes offline
  pollbookC.setOnlineStatus(false);

  // Wait a bit to ensure physical timestamps will be different
  await sleep(10);

  // Sue checks in on PollbookC while offline
  pollbookC.recordVoterCheckIn({
    voterId: 'sue',
    identificationMethod: { type: 'photoId', state: 'nh' },
  });

  // Wait a bit to ensure physical timestamps will be different
  await sleep(10);

  // PollbookA and PollbookB check in more voters and sync events
  pollbookA.recordVoterCheckIn({
    voterId: 'dave',
    identificationMethod: { type: 'photoId', state: 'nh' },
  });
  pollbookB.recordVoterCheckIn({
    voterId: 'eve',
    identificationMethod: { type: 'photoId', state: 'nh' },
  });

  // Sync events between PollbookA and PollbookB, PollbookC is "offline" and does not sync
  syncEventsForAllPollbooks([pollbookA, pollbookB]);
  expect(pollbookA.getCheckInCount()).toEqual(5);
  expect(pollbookB.getCheckInCount()).toEqual(5);
  expect(pollbookC.getCheckInCount()).toEqual(4);

  // PollbookB is shutdown
  pollbookB.setOnlineStatus(false);

  // PollbookC rejoins the network
  pollbookC.setOnlineStatus(true);

  // Sync events between PollbookA and PollbookC
  syncEventsForAllPollbooks([pollbookA, pollbookC]);

  // Verify PollbookA has Carl's check-in from PollbookC
  expect(pollbookA.getCheckInCount()).toEqual(6);
  expect(pollbookC.getCheckInCount()).toEqual(6);
  expect(pollbookA.searchVoters({ firstName: 'Carl', lastName: '' })).toEqual([
    expect.objectContaining({
      voterId: 'carl',
      checkIn: expect.objectContaining({
        identificationMethod: { type: 'photoId', state: 'nh' },
        machineId: 'pollbook-c',
      }),
    }),
  ]);

  // PollbookC is shutdown
  pollbookC.setOnlineStatus(false);

  // PollbookB rejoins the network
  pollbookB.setOnlineStatus(true);

  // Sync events between PollbookA and PollbookB
  syncEventsForAllPollbooks([pollbookA, pollbookB]);

  // Verify PollbookB has Carl's check-in from PollbookA
  expect(pollbookB.getCheckInCount()).toEqual(6);
  expect(pollbookB.searchVoters({ firstName: 'Carl', lastName: '' })).toEqual([
    expect.objectContaining({
      voterId: 'carl',
      checkIn: expect.objectContaining({
        identificationMethod: { type: 'photoId', state: 'nh' },
        machineId: 'pollbook-c',
      }),
    }),
  ]);
  // This is unchanged
  expect(pollbookA.getCheckInCount()).toEqual(6);
});

test('last write wins on double check ins', async () => {
  const pollbookA = Store.memoryStore('pollbook-a');
  const pollbookB = Store.memoryStore('pollbook-b');

  // Set up test election and voters
  const testElection = getTestElection();
  const testVoters = [
    createVoter('bob', 'Bob', 'Smith'),
    createVoter('charlie', 'Charlie', 'Brown'),
    createVoter('sue', 'Sue', 'Jones'),
  ];

  pollbookA.setElectionAndVoters(testElection, [], testVoters);
  pollbookB.setElectionAndVoters(testElection, [], testVoters);

  pollbookA.setOnlineStatus(true);
  pollbookB.setOnlineStatus(true);

  pollbookA.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'photoId', state: 'nh' },
  });
  expect(pollbookA.getCheckInCount()).toEqual(1);

  // allow real time to pass
  await sleep(10);

  pollbookB.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: {
      type: 'personalRecognizance',
      recognizerType: 'supervisor',
    },
  });
  expect(pollbookB.getCheckInCount()).toEqual(1);

  // Sync events between all pollbooks
  syncEventsForAllPollbooks([pollbookA, pollbookB]);

  // Verify the last write wins
  expect(pollbookA.getCheckInCount()).toEqual(1);
  expect(pollbookB.getCheckInCount()).toEqual(1);
  expect(pollbookA.searchVoters({ firstName: 'Bob', lastName: '' })).toEqual([
    expect.objectContaining({
      voterId: 'bob',
      checkIn: expect.objectContaining({
        identificationMethod: {
          type: 'personalRecognizance',
          recognizer: 'supervisor',
        },
        machineId: 'pollbook-b',
      }),
    }),
  ]);
  expect(pollbookB.searchVoters({ firstName: 'Bob', lastName: '' })).toEqual([
    expect.objectContaining({
      voterId: 'bob',
      checkIn: expect.objectContaining({
        identificationMethod: {
          type: 'personalRecognizance',
          recognizer: 'supervisor',
        },
        machineId: 'pollbook-b',
      }),
    }),
  ]);
});

test('last write wins even when there is bad system time after a sync', () => {
  jest.useFakeTimers();

  // Set up two pollbook nodes
  const pollbookA = Store.memoryStore('pollbook-a');
  const pollbookB = Store.memoryStore('pollbook-b');

  // Set up test election and voters
  const testElection = getTestElection();
  const testVoters = [createVoter('bob', 'Bob', 'Smith')];

  // Initialize both pollbooks with same election data
  pollbookA.setElectionAndVoters(testElection, [], testVoters);
  pollbookB.setElectionAndVoters(testElection, [], testVoters);

  // Both pollbooks come online
  pollbookA.setOnlineStatus(true);
  pollbookB.setOnlineStatus(true);

  // Set time to 9am for PollbookB's check-in
  const nineAm = new Date('2024-01-01T09:00:00Z').getTime();
  jest.setSystemTime(nineAm);

  // Bob checks in on PollbookB (with correct time)
  pollbookB.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'photoId', state: 'nh' },
  });
  expect(pollbookB.getCheckInCount()).toEqual(1);

  // PollbookA & B sync events
  syncEventsForAllPollbooks([pollbookA, pollbookB]);

  // Set time back to 8am for PollbookA's double check in operation
  const eightAm = new Date('2024-01-01T08:00:00Z').getTime();
  jest.setSystemTime(eightAm);

  // The bob check in is undone on PollbookA (with wrong time)
  pollbookA.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: {
      type: 'personalRecognizance',
      recognizerType: 'supervisor',
    },
  });
  expect(pollbookA.getCheckInCount()).toEqual(1);
  expect(pollbookA.searchVoters({ firstName: 'Bob', lastName: '' })).toEqual([
    expect.objectContaining({
      voterId: 'bob',
      checkIn: expect.objectContaining({
        identificationMethod: {
          type: 'personalRecognizance',
          recognizer: 'supervisor',
        },
        machineId: 'pollbook-a',
      }),
    }),
  ]);

  // PollbookB syncs events from PollbookA
  syncEventsForAllPollbooks([pollbookA, pollbookB]);
  expect(pollbookA.getCheckInCount()).toEqual(1);
  expect(pollbookB.getCheckInCount()).toEqual(1);

  expect(pollbookA.searchVoters({ firstName: 'Bob', lastName: '' })).toEqual([
    expect.objectContaining({
      voterId: 'bob',
      checkIn: expect.objectContaining({
        identificationMethod: {
          type: 'personalRecognizance',
          recognizer: 'supervisor',
        },
        machineId: 'pollbook-a',
      }),
    }),
  ]);
  expect(pollbookB.searchVoters({ firstName: 'Bob', lastName: '' })).toEqual([
    expect.objectContaining({
      voterId: 'bob',
      checkIn: expect.objectContaining({
        identificationMethod: {
          type: 'personalRecognizance',
          recognizer: 'supervisor',
        },
        machineId: 'pollbook-a',
      }),
    }),
  ]);

  jest.useRealTimers();
});

test('simultaneous events are handled properly', () => {
  jest.useFakeTimers();
  const nineAm = new Date('2024-01-01T09:00:00Z').getTime();
  jest.setSystemTime(nineAm);

  // Set up two pollbook nodes
  const pollbookA = Store.memoryStore('pollbook-a');
  const pollbookB = Store.memoryStore('pollbook-b');
  const pollbookC = Store.memoryStore('pollbook-c');

  // Set up test election and voters
  const testElection = getTestElection();
  const testVoters = [
    createVoter('bob', 'Bob', 'Smith'),
    createVoter('charlie', 'Charlie', 'Brown'),
    createVoter('sue', 'Sue', 'Jones'),
  ];

  // Initialize both pollbooks with same election data
  pollbookA.setElectionAndVoters(testElection, [], testVoters);
  pollbookB.setElectionAndVoters(testElection, [], testVoters);
  pollbookC.setElectionAndVoters(testElection, [], testVoters);

  // Both pollbooks come online
  pollbookA.setOnlineStatus(true);
  pollbookB.setOnlineStatus(true);
  pollbookC.setOnlineStatus(true);

  // Charlie checks in and then is undone on pollbookA
  pollbookA.recordVoterCheckIn({
    voterId: 'charlie',
    identificationMethod: { type: 'photoId', state: 'nh' },
  });
  expect(pollbookA.getCheckInCount()).toEqual(1);
  pollbookA.recordUndoVoterCheckIn('charlie');
  expect(pollbookA.getCheckInCount()).toEqual(0);

  // Bob checks in on PollbookB (with correct time)
  pollbookB.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'photoId', state: 'nh' },
  });
  expect(pollbookB.getCheckInCount()).toEqual(1);

  // Sue checks in on PollbookC
  pollbookC.recordVoterCheckIn({
    voterId: 'sue',
    identificationMethod: { type: 'photoId', state: 'nh' },
  });
  expect(pollbookC.getCheckInCount()).toEqual(1);

  // Pollbooks sync events
  syncEventsForAllPollbooks([pollbookA, pollbookB, pollbookC]);

  expect(pollbookA.getCheckInCount()).toEqual(2);
  expect(pollbookB.getCheckInCount()).toEqual(2);
  expect(pollbookC.getCheckInCount()).toEqual(2);

  jest.useRealTimers();
});

test('late-arriving older event with a more recent undo', () => {
  // Set up three pollbook nodes
  const pollbookA = Store.memoryStore('pollbook-a');
  const pollbookB = Store.memoryStore('pollbook-b');
  const pollbookC = Store.memoryStore('pollbook-c');

  // Set up test election and voters
  const testElection = getTestElection();
  const testVoters = [
    createVoter('oscar', 'Oscar', 'Wilde'),
    createVoter('penny', 'Penny', 'Lane'),
  ];

  // Initialize all pollbooks with same election data
  pollbookA.setElectionAndVoters(testElection, [], testVoters);
  pollbookB.setElectionAndVoters(testElection, [], testVoters);
  pollbookC.setElectionAndVoters(testElection, [], testVoters);

  // Pollbook A and B come online
  pollbookA.setOnlineStatus(true);
  pollbookB.setOnlineStatus(true);

  // Oscar checks in on PollbookB
  pollbookB.recordVoterCheckIn({
    voterId: 'oscar',
    identificationMethod: { type: 'photoId', state: 'nh' },
  });
  expect(pollbookB.getCheckInCount()).toEqual(1);

  // Pollbook A syncs with Pollbook B
  syncEventsForAllPollbooks([pollbookB, pollbookA]);
  expect(pollbookA.getCheckInCount()).toEqual(1);
  expect(pollbookB.getCheckInCount()).toEqual(1);

  // Pollbook B undoes Oscar's check-in
  pollbookB.recordUndoVoterCheckIn('oscar');
  expect(pollbookB.getCheckInCount()).toEqual(0);

  // Pollbook B goes offline
  pollbookB.setOnlineStatus(false);

  // Pollbook C comes online
  pollbookC.setOnlineStatus(true);

  // Penny checks in on PollbookC
  pollbookC.recordVoterCheckIn({
    voterId: 'penny',
    identificationMethod: { type: 'photoId', state: 'nh' },
  });
  expect(pollbookC.getCheckInCount()).toEqual(1);

  // Pollbook C syncs with Pollbook A
  syncEventsForAllPollbooks([pollbookC, pollbookA]);
  expect(pollbookA.getCheckInCount()).toEqual(2);
  expect(pollbookC.getCheckInCount()).toEqual(2);

  // Pollbook A goes offline
  pollbookA.setOnlineStatus(false);

  // Pollbook B comes online and syncs with Pollbook C
  pollbookB.setOnlineStatus(true);
  syncEventsForAllPollbooks([pollbookC, pollbookB]);
  expect(pollbookB.getCheckInCount()).toEqual(1);
  expect(pollbookC.getCheckInCount()).toEqual(1);

  // Pollbook A comes back online and syncs with Pollbook B
  pollbookA.setOnlineStatus(true);
  syncEventsForAllPollbooks([pollbookB, pollbookA]);

  // Verify final state
  expect(pollbookA.getCheckInCount()).toEqual(1);
  expect(pollbookB.getCheckInCount()).toEqual(1);
  expect(pollbookC.getCheckInCount()).toEqual(1);

  // Verify Oscar is undone and Penny is checked in
  const oscarA = pollbookA.searchVoters({ firstName: 'Oscar', lastName: '' });
  const oscarB = pollbookB.searchVoters({ firstName: 'Oscar', lastName: '' });
  const oscarC = pollbookC.searchVoters({ firstName: 'Oscar', lastName: '' });
  expect((oscarA as Voter[])[0].checkIn).toBeUndefined();
  expect((oscarB as Voter[])[0].checkIn).toBeUndefined();
  expect((oscarC as Voter[])[0].checkIn).toBeUndefined();

  const pennyA = pollbookA.searchVoters({ firstName: 'Penny', lastName: '' });
  const pennyB = pollbookB.searchVoters({ firstName: 'Penny', lastName: '' });
  const pennyC = pollbookC.searchVoters({ firstName: 'Penny', lastName: '' });
  expect((pennyA as Voter[])[0].checkIn).toBeDefined();
  expect((pennyB as Voter[])[0].checkIn).toBeDefined();
  expect((pennyC as Voter[])[0].checkIn).toBeDefined();
});
