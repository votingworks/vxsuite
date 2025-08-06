import { test, expect, vi } from 'vitest';
import { sleep } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import {
  Voter,
  VoterAddressChangeRequest,
  VoterNameChangeRequest,
} from '@votingworks/types';
import {
  createValidStreetInfo,
  createVoter,
  getTestElectionDefinition,
  syncEventsForAllPollbooks,
  syncEventsFromTo,
} from '../test/test_helpers';
import { LocalStore } from './local_store';
import { PeerStore } from './peer_store';

function setupFileStores(machineId: string): [LocalStore, PeerStore] {
  const workspacePath = makeTemporaryDirectory();
  const localStore = LocalStore.fileStore(
    workspacePath,
    mockBaseLogger({ fn: vi.fn }),
    machineId,
    'test'
  );
  const peerStore = PeerStore.fileStore(
    workspacePath,
    mockBaseLogger({ fn: vi.fn }),
    machineId,
    'test'
  );
  return [localStore, peerStore];
}

test('stores will not sync when not configured properly', () => {
  // Set up two pollbook nodes
  const [localA, peerA] = setupFileStores('pollbook-a');
  const [localB, peerB] = setupFileStores('pollbook-b');

  // Set up test election and voters
  const testElectionDefinition = getTestElectionDefinition();
  const testVoters = [
    createVoter('bob', 'Bob', 'Smith'),
    createVoter('charlie', 'Charlie', 'Brown'),
    createVoter('sue', 'Sue', 'Jones'),
  ];

  // Initialize both pollbooks with same election data
  localA.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    [],
    testVoters
  );
  localB.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    [],
    testVoters
  );

  // Configure Pollbook A
  localA.setConfiguredPrecinct(testElectionDefinition.election.precincts[0].id);
  // Bob checks in on PollbookA
  localA.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  expect(localA.getCheckInCount()).toEqual(1);
  expect(peerA.getCheckInCount()).toEqual(1);

  expect(syncEventsFromTo(peerA, peerB)).toHaveLength(0);

  // Events still should not sync as the configured precinct does not match.
  expect(syncEventsFromTo(peerA, peerB)).toHaveLength(0);

  // Configure Pollbook B to a different precinct
  localB.setConfiguredPrecinct(testElectionDefinition.election.precincts[1].id);
  expect(syncEventsFromTo(peerA, peerB)).toHaveLength(0);

  // Configure Pollbook B to the same precinct
  localB.setConfiguredPrecinct(testElectionDefinition.election.precincts[0].id);
  expect(syncEventsFromTo(peerA, peerB)).toHaveLength(1);
});

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
  const [localA, peerA] = setupFileStores('pollbook-a');
  const [localB, peerB] = setupFileStores('pollbook-b');

  // Set up test election and voters
  const testElectionDefinition = getTestElectionDefinition();
  const testVoters = [
    createVoter('bob', 'Bob', 'Smith'),
    createVoter('charlie', 'Charlie', 'Brown'),
    createVoter('sue', 'Sue', 'Jones'),
  ];
  for (const store of [localA, localB]) {
    store.setElectionAndVoters(
      testElectionDefinition,
      'mock-package-hash',
      [],
      testVoters
    );
    store.setConfiguredPrecinct(
      testElectionDefinition.election.precincts[0].id
    );
  }

  // Bob checks in on PollbookA
  localA.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  expect(localA.getCheckInCount()).toEqual(1);
  expect(peerA.getCheckInCount()).toEqual(1);

  // Charlie checks in on PollbookB
  localB.recordVoterCheckIn({
    voterId: 'charlie',
    identificationMethod: { type: 'outOfStateLicense', state: 'al' },
    ballotParty: 'REP',
  });
  expect(localB.getCheckInCount()).toEqual(1);
  expect(peerB.getCheckInCount()).toEqual(1);

  // Pollbook B syncs with Pollbook A
  const eventsForB = syncEventsFromTo(peerA, peerB);
  expect(eventsForB.length).toEqual(1);

  // Pollbook A syncs with Pollbook B
  const eventsForA = syncEventsFromTo(peerB, peerA);
  expect(eventsForA.length).toEqual(1);

  // Verify both pollbooks see Bob and Charlie checked in
  expect(localA.getCheckInCount()).toEqual(2);
  expect(localB.getCheckInCount()).toEqual(2);

  // PollbookB goes offline
  peerB.setOnlineStatus(false);

  // Sue checks in with a CA id and then is undone on PollbookB while offline
  localB.recordVoterCheckIn({
    voterId: 'sue',
    identificationMethod: { type: 'outOfStateLicense', state: 'ca' },
    ballotParty: 'REP',
  });
  localB.recordUndoVoterCheckIn({ voterId: 'sue', reason: '' });

  // Wait a bit to ensure physical timestamps will be different
  await sleep(10);

  // Sue checks in on PollbookA
  localA.recordVoterCheckIn({
    voterId: 'sue',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });

  // PollbookB comes back online
  peerB.setOnlineStatus(true);

  // Pollbook B syncs with Pollbook A
  const finalEventsForB = syncEventsFromTo(peerA, peerB);
  expect(finalEventsForB.length).toEqual(1);

  // Pollbook A sync with Pollbook B
  const finalEventsForA = syncEventsFromTo(peerB, peerA);
  expect(finalEventsForA.length).toEqual(2);

  // Verify final state
  // Both pollbooks should see all three voters checked in
  expect(localA.getCheckInCount()).toEqual(3);
  expect(localB.getCheckInCount()).toEqual(3);

  // Verify Sue's check-in is from PollbookA with NH id.
  const voters = localA.searchVoters({
    firstName: 'Sue',
    middleName: '',
    lastName: '',
    suffix: '',
  });
  expect((voters as Voter[]).length).toEqual(1);
  expect((voters as Voter[])[0].checkIn).toEqual({
    timestamp: expect.any(String),
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
    machineId: 'pollbook-a',
    receiptNumber: 2,
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
  vi.useFakeTimers();

  // Set up two pollbook nodes
  const [localA, peerA] = setupFileStores('pollbook-a');
  const [localB, peerB] = setupFileStores('pollbook-b');

  // Set up test election and voters
  const testElectionDefinition = getTestElectionDefinition();
  const testVoters = [createVoter('bob', 'Bob', 'Smith')];

  for (const store of [localA, localB]) {
    store.setElectionAndVoters(
      testElectionDefinition,
      'mock-package-hash',
      [],
      testVoters
    );
    store.setConfiguredPrecinct(
      testElectionDefinition.election.precincts[0].id
    );
  }

  // Set time to 9am for PollbookB's check-in
  const nineAm = new Date('2024-01-01T09:00:00Z').getTime();
  vi.setSystemTime(nineAm);

  // Bob checks in on PollbookB (with correct time)
  localB.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  expect(localB.getCheckInCount()).toEqual(1);
  expect(peerB.getCheckInCount()).toEqual(1);

  // PollbookA syncs events from PollbookB
  const eventsForA = syncEventsFromTo(peerB, peerA);
  expect(eventsForA.length).toEqual(1);
  expect(localA.getCheckInCount()).toEqual(1);
  expect(peerA.getCheckInCount()).toEqual(1);

  // Set time back to 8am for PollbookA's undo operation
  const eightAm = new Date('2024-01-01T08:00:00Z').getTime();
  vi.setSystemTime(eightAm);

  // The bob check in is undone on PollbookA (with wrong time)
  localA.recordUndoVoterCheckIn({ voterId: 'bob', reason: '' });
  expect(localA.getCheckInCount()).toEqual(0);

  // PollbookB syncs events from PollbookA
  const eventsForB = syncEventsFromTo(peerA, peerB);
  expect(eventsForB.length).toEqual(1);

  // Verify final state - Bob should be marked as NOT checked in on both machines
  // even though the undo event has an earlier timestamp
  expect(localA.getCheckInCount()).toEqual(0);
  expect(localB.getCheckInCount()).toEqual(0);

  // Verify Bob's status specifically
  const votersA = localA.searchVoters({
    firstName: 'Bob',
    middleName: '',
    lastName: '',
    suffix: '',
  });
  const votersB = localB.searchVoters({
    firstName: 'Bob',
    middleName: '',
    lastName: '',
    suffix: '',
  });
  expect((votersA as Voter[])[0].checkIn).toBeUndefined();
  expect((votersB as Voter[])[0].checkIn).toBeUndefined();

  vi.useRealTimers();
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
  const [localA, peerA] = setupFileStores('pollbook-a');
  const [localB, peerB] = setupFileStores('pollbook-b');
  const [localC, peerC] = setupFileStores('pollbook-c');

  // Set up test election and voters
  const testElectionDefinition = getTestElectionDefinition();
  const testVoters = [
    createVoter('alice', 'Alice', 'Wonderland'),
    createVoter('bob', 'Bob', 'Builder'),
    createVoter('carl', 'Carl', 'Sagan'),
    createVoter('sue', 'Sue', 'Jones'),
    createVoter('dave', 'Dave', 'Smith'),
    createVoter('eve', 'Eve', 'Johnson'),
  ];

  for (const store of [localA, localB, localC]) {
    store.setElectionAndVoters(
      testElectionDefinition,
      'mock-package-hash',
      [],
      testVoters
    );
    store.setConfiguredPrecinct(
      testElectionDefinition.election.precincts[0].id
    );
  }

  // Alice checks in on PollbookA
  localA.recordVoterCheckIn({
    voterId: 'alice',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  expect(localA.getCheckInCount()).toEqual(1);
  expect(peerA.getCheckInCount()).toEqual(1);

  // Bob checks in on PollbookB
  localB.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  expect(localB.getCheckInCount()).toEqual(1);
  expect(peerB.getCheckInCount()).toEqual(1);

  // Carl checks in on PollbookC
  localC.recordVoterCheckIn({
    voterId: 'carl',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  expect(localC.getCheckInCount()).toEqual(1);
  expect(peerC.getCheckInCount()).toEqual(1);

  // Sync events between all pollbooks
  syncEventsForAllPollbooks([peerA, peerB, peerC]);

  // Verify all pollbooks see Alice, Bob, and Carl checked in
  expect(localA.getCheckInCount()).toEqual(3);
  expect(localB.getCheckInCount()).toEqual(3);
  expect(localC.getCheckInCount()).toEqual(3);

  // PollbookC goes offline
  peerC.setOnlineStatus(false);

  // Wait a bit to ensure physical timestamps will be different
  await sleep(10);

  // Sue checks in on PollbookC while offline
  localC.recordVoterCheckIn({
    voterId: 'sue',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });

  // Wait a bit to ensure physical timestamps will be different
  await sleep(10);

  // PollbookA and PollbookB check in more voters and sync events
  localA.recordVoterCheckIn({
    voterId: 'dave',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  localB.recordVoterCheckIn({
    voterId: 'eve',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });

  // Sync events between PollbookA and PollbookB, PollbookC is "offline" and does not sync
  syncEventsForAllPollbooks([peerA, peerB]);
  expect(localA.getCheckInCount()).toEqual(5);
  expect(localB.getCheckInCount()).toEqual(5);
  expect(localC.getCheckInCount()).toEqual(4);

  // PollbookB is shutdown
  peerB.setOnlineStatus(false);

  // PollbookC rejoins the network
  peerC.setOnlineStatus(true);

  // Sync events between PollbookA and PollbookC
  syncEventsForAllPollbooks([peerA, peerC]);

  // Verify PollbookA has Carl's check-in from PollbookC
  expect(localA.getCheckInCount()).toEqual(6);
  expect(localC.getCheckInCount()).toEqual(6);
  expect(
    localA.searchVoters({
      firstName: 'Carl',
      middleName: '',
      lastName: '',
      suffix: '',
    })
  ).toEqual([
    expect.objectContaining({
      voterId: 'carl',
      checkIn: expect.objectContaining({
        identificationMethod: { type: 'default' },
        ballotParty: 'DEM',
        machineId: 'pollbook-c',
      }),
    }),
  ]);

  // PollbookC is shutdown
  peerC.setOnlineStatus(false);

  // PollbookB rejoins the network
  peerB.setOnlineStatus(true);

  // Sync events between PollbookA and PollbookB
  syncEventsForAllPollbooks([peerA, peerB]);

  // Verify PollbookB has Carl's check-in from PollbookA
  expect(localB.getCheckInCount()).toEqual(6);
  expect(
    localB.searchVoters({
      firstName: 'Carl',
      middleName: '',
      lastName: '',
      suffix: '',
    })
  ).toEqual([
    expect.objectContaining({
      voterId: 'carl',
      checkIn: expect.objectContaining({
        identificationMethod: { type: 'default' },
        ballotParty: 'DEM',
        machineId: 'pollbook-c',
      }),
    }),
  ]);
  // This is unchanged
  expect(localA.getCheckInCount()).toEqual(6);
});

test('last write wins on double check ins', async () => {
  const [localA, peerA] = setupFileStores('pollbook-a');
  const [localB, peerB] = setupFileStores('pollbook-b');

  // Set up test election and voters
  const testElectionDefinition = getTestElectionDefinition();
  const testVoters = [
    createVoter('bob', 'Bob', 'Smith'),
    createVoter('charlie', 'Charlie', 'Brown'),
    createVoter('sue', 'Sue', 'Jones'),
  ];

  for (const store of [localA, localB]) {
    store.setElectionAndVoters(
      testElectionDefinition,
      'mock-package-hash',
      [],
      testVoters
    );
    store.setConfiguredPrecinct(
      testElectionDefinition.election.precincts[0].id
    );
  }

  localA.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  expect(localA.getCheckInCount()).toEqual(1);

  // allow real time to pass
  await sleep(10);

  localB.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  expect(localB.getCheckInCount()).toEqual(1);

  // Sync events between all pollbooks
  syncEventsForAllPollbooks([peerA, peerB]);

  // Verify the last write wins
  expect(localA.getCheckInCount()).toEqual(1);
  expect(localB.getCheckInCount()).toEqual(1);
  expect(
    localA.searchVoters({
      firstName: 'Bob',
      middleName: '',
      lastName: '',
      suffix: '',
    })
  ).toEqual([
    expect.objectContaining({
      voterId: 'bob',
      checkIn: expect.objectContaining({
        identificationMethod: {
          type: 'default',
        },
        machineId: 'pollbook-b',
      }),
    }),
  ]);
  expect(
    localB.searchVoters({
      firstName: 'Bob',
      middleName: '',
      lastName: '',
      suffix: '',
    })
  ).toEqual([
    expect.objectContaining({
      voterId: 'bob',
      checkIn: expect.objectContaining({
        identificationMethod: {
          type: 'default',
        },
        machineId: 'pollbook-b',
      }),
    }),
  ]);
});

test('last write wins even when there is bad system time after a sync', () => {
  vi.useFakeTimers();

  // Set up two pollbook nodes
  const [localA, peerA] = setupFileStores('pollbook-a');
  const [localB, peerB] = setupFileStores('pollbook-b');

  // Set up test election and voters
  const testElectionDefinition = getTestElectionDefinition();
  const testVoters = [createVoter('bob', 'Bob', 'Smith')];

  for (const store of [localA, localB]) {
    store.setElectionAndVoters(
      testElectionDefinition,
      'mock-package-hash',
      [],
      testVoters
    );
    store.setConfiguredPrecinct(
      testElectionDefinition.election.precincts[0].id
    );
  }

  // Set time to 9am for PollbookB's check-in
  const nineAm = new Date('2024-01-01T09:00:00Z').getTime();
  vi.setSystemTime(nineAm);

  // Bob checks in on PollbookB (with correct time)
  localB.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  expect(localB.getCheckInCount()).toEqual(1);

  // PollbookA & B sync events
  syncEventsForAllPollbooks([peerA, peerB]);

  // Set time back to 8am for PollbookA's double check in operation
  const eightAm = new Date('2024-01-01T08:00:00Z').getTime();
  vi.setSystemTime(eightAm);

  // The bob check in is undone on PollbookA (with wrong time)
  localA.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  expect(localA.getCheckInCount()).toEqual(1);
  expect(
    localA.searchVoters({
      firstName: 'Bob',
      middleName: '',
      lastName: '',
      suffix: '',
    })
  ).toEqual([
    expect.objectContaining({
      voterId: 'bob',
      checkIn: expect.objectContaining({
        identificationMethod: {
          type: 'default',
        },
        machineId: 'pollbook-a',
      }),
    }),
  ]);

  // PollbookB syncs events from PollbookA
  syncEventsForAllPollbooks([peerA, peerB]);
  expect(localA.getCheckInCount()).toEqual(1);
  expect(localB.getCheckInCount()).toEqual(1);

  expect(
    localA.searchVoters({
      firstName: 'Bob',
      middleName: '',
      lastName: '',
      suffix: '',
    })
  ).toEqual([
    expect.objectContaining({
      voterId: 'bob',
      checkIn: expect.objectContaining({
        identificationMethod: {
          type: 'default',
        },
        machineId: 'pollbook-a',
      }),
    }),
  ]);
  expect(
    localB.searchVoters({
      firstName: 'Bob',
      middleName: '',
      lastName: '',
      suffix: '',
    })
  ).toEqual([
    expect.objectContaining({
      voterId: 'bob',
      checkIn: expect.objectContaining({
        identificationMethod: {
          type: 'default',
        },
        machineId: 'pollbook-a',
      }),
    }),
  ]);

  vi.useRealTimers();
});

test('simultaneous events are handled properly', () => {
  vi.useFakeTimers();
  const nineAm = new Date('2024-01-01T09:00:00Z').getTime();
  vi.setSystemTime(nineAm);

  // Set up two pollbook nodes
  const [localA, peerA] = setupFileStores('pollbook-a');
  const [localB, peerB] = setupFileStores('pollbook-b');
  const [localC, peerC] = setupFileStores('pollbook-c');

  // Set up test election and voters
  const testElectionDefinition = getTestElectionDefinition();
  const testVoters = [
    createVoter('bob', 'Bob', 'Smith'),
    createVoter('charlie', 'Charlie', 'Brown'),
    createVoter('sue', 'Sue', 'Jones'),
  ];

  for (const store of [localA, localB, localC]) {
    store.setElectionAndVoters(
      testElectionDefinition,
      'mock-package-hash',
      [],
      testVoters
    );
    store.setConfiguredPrecinct(
      testElectionDefinition.election.precincts[0].id
    );
  }

  // Charlie checks in and then is undone on pollbookA
  localA.recordVoterCheckIn({
    voterId: 'charlie',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  expect(localA.getCheckInCount()).toEqual(1);
  localA.recordUndoVoterCheckIn({ voterId: 'charlie', reason: '' });
  expect(localA.getCheckInCount()).toEqual(0);

  // Bob checks in on PollbookB (with correct time)
  localB.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  expect(localB.getCheckInCount()).toEqual(1);

  // Sue checks in on PollbookC
  localC.recordVoterCheckIn({
    voterId: 'sue',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  expect(localC.getCheckInCount()).toEqual(1);

  // Pollbooks sync events
  syncEventsForAllPollbooks([peerA, peerB, peerC]);

  expect(localA.getCheckInCount()).toEqual(2);
  expect(localB.getCheckInCount()).toEqual(2);
  expect(localC.getCheckInCount()).toEqual(2);

  vi.useRealTimers();
});

test('late-arriving older event with a more recent undo', () => {
  // Set up three pollbook nodes
  const [localA, peerA] = setupFileStores('pollbook-a');
  const [localB, peerB] = setupFileStores('pollbook-b');
  const [localC, peerC] = setupFileStores('pollbook-c');

  // Set up test election and voters
  const testElectionDefinition = getTestElectionDefinition();
  const testVoters = [
    createVoter('oscar', 'Oscar', 'Wilde'),
    createVoter('penny', 'Penny', 'Lane'),
  ];

  for (const store of [localA, localB, localC]) {
    store.setElectionAndVoters(
      testElectionDefinition,
      'mock-package-hash',
      [],
      testVoters
    );
    store.setConfiguredPrecinct(
      testElectionDefinition.election.precincts[0].id
    );
  }

  // Oscar checks in on PollbookB
  localB.recordVoterCheckIn({
    voterId: 'oscar',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  expect(localB.getCheckInCount()).toEqual(1);

  // Pollbook A syncs with Pollbook B
  syncEventsForAllPollbooks([peerB, peerA]);
  expect(localA.getCheckInCount()).toEqual(1);
  expect(localB.getCheckInCount()).toEqual(1);

  // Pollbook B undoes Oscar's check-in
  localB.recordUndoVoterCheckIn({ voterId: 'oscar', reason: '' });
  expect(localB.getCheckInCount()).toEqual(0);

  // Pollbook B goes offline
  peerB.setOnlineStatus(false);

  // Pollbook C comes online
  peerC.setOnlineStatus(true);

  // Penny checks in on PollbookC
  localC.recordVoterCheckIn({
    voterId: 'penny',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  expect(localC.getCheckInCount()).toEqual(1);

  // Pollbook C syncs with Pollbook A
  syncEventsForAllPollbooks([peerC, peerA]);
  expect(localA.getCheckInCount()).toEqual(2);
  expect(localC.getCheckInCount()).toEqual(2);

  // Pollbook A goes offline
  peerA.setOnlineStatus(false);

  // Pollbook B comes online and syncs with Pollbook C
  peerB.setOnlineStatus(true);
  syncEventsForAllPollbooks([peerC, peerB]);
  expect(localB.getCheckInCount()).toEqual(1);
  expect(localC.getCheckInCount()).toEqual(1);

  // Pollbook A comes back online and syncs with Pollbook B
  peerA.setOnlineStatus(true);
  syncEventsForAllPollbooks([peerB, peerA]);

  // Verify final state
  expect(localA.getCheckInCount()).toEqual(1);
  expect(localB.getCheckInCount()).toEqual(1);
  expect(localC.getCheckInCount()).toEqual(1);

  // Verify Oscar is undone and Penny is checked in
  const oscarA = localA.searchVoters({
    firstName: 'Oscar',
    middleName: '',
    lastName: '',
    suffix: '',
  });
  const oscarB = localB.searchVoters({
    firstName: 'Oscar',
    middleName: '',
    lastName: '',
    suffix: '',
  });
  const oscarC = localC.searchVoters({
    firstName: 'Oscar',
    middleName: '',
    lastName: '',
    suffix: '',
  });
  expect((oscarA as Voter[])[0].checkIn).toBeUndefined();
  expect((oscarB as Voter[])[0].checkIn).toBeUndefined();
  expect((oscarC as Voter[])[0].checkIn).toBeUndefined();

  const pennyA = localA.searchVoters({
    firstName: 'Penny',
    middleName: '',
    lastName: '',
    suffix: '',
  });
  const pennyB = localB.searchVoters({
    firstName: 'Penny',
    middleName: '',
    lastName: '',
    suffix: '',
  });
  const pennyC = localC.searchVoters({
    firstName: 'Penny',
    middleName: '',
    lastName: '',
    suffix: '',
  });
  expect((pennyA as Voter[])[0].checkIn).toBeDefined();
  expect((pennyB as Voter[])[0].checkIn).toBeDefined();
  expect((pennyC as Voter[])[0].checkIn).toBeDefined();
});

test('all possible events are synced', () => {
  // Set up two pollbook nodes
  const [localA, peerA] = setupFileStores('pollbook-a');
  const [localB, peerB] = setupFileStores('pollbook-b');

  // Set up test election and voters
  const testElectionDefinition = getTestElectionDefinition();
  const testVoters = [
    createVoter('oscar', 'Oscar', 'Wilde'),
    createVoter('penny', 'Penny', 'Lane'),
  ];
  const streets = [
    createValidStreetInfo('MAIN ST', 'odd', 1, 15, '', '', 'precinct-0'),
  ];

  for (const store of [localA, localB]) {
    store.setElectionAndVoters(
      testElectionDefinition,
      'mock-package-hash',
      streets,
      testVoters
    );
    store.setConfiguredPrecinct(
      testElectionDefinition.election.precincts[0].id
    );
  }

  const nameChangeData: VoterNameChangeRequest = {
    firstName: 'Ozcar',
    middleName: 'Oz',
    lastName: 'Wild',
    suffix: 'Jr.',
  };

  // Pollbook A changes name for Oscar
  localA.changeVoterName('oscar', nameChangeData);

  const addressChangeData: VoterAddressChangeRequest = {
    streetNumber: '15',
    streetSuffix: 'B',
    streetName: 'MAIN ST',
    apartmentUnitNumber: 'Apt 4B',
    houseFractionNumber: '',
    addressLine2: 'line 2',
    addressLine3: '',
    city: 'Manchester',
    state: 'NH',
    zipCode: '03101',
    precinct: 'precinct-0',
  };
  // Pollbook A changes address for Penny
  localA.changeVoterAddress('penny', addressChangeData);

  // Register a vew voter on Pollbook B
  localB.registerVoter({
    firstName: 'New',
    middleName: 'Voter',
    lastName: 'Test',
    suffix: '',
    streetNumber: '13',
    streetSuffix: '',
    streetName: 'MAIN ST',
    apartmentUnitNumber: '',
    party: 'UND',
    houseFractionNumber: '',
    addressLine2: '',
    addressLine3: '',
    city: 'Manchester',
    state: 'NH',
    zipCode: '03101',
    precinct: 'precinct-0',
  });
  // Pollbook A syncs with Pollbook B
  syncEventsForAllPollbooks([peerA, peerB]);

  // No one should be checked in
  expect(localA.getCheckInCount()).toEqual(0);
  expect(localB.getCheckInCount()).toEqual(0);

  // Both pollbooks should have the same number of voters
  for (const pollbook of [localA, localB]) {
    const voters = pollbook.getAllVotersInPrecinctSorted();
    expect(voters).toHaveLength(3);
    expect(voters).toMatchObject([
      expect.objectContaining({
        voterId: 'penny',
        firstName: 'Penny',
        lastName: 'Lane',
        addressChange: {
          ...addressChangeData,
          timestamp: expect.any(String),
        },
      }),
      expect.objectContaining({
        firstName: 'New',
        middleName: 'Voter',
        lastName: 'Test',
        party: 'UND',
        registrationEvent: expect.objectContaining({
          streetNumber: '13',
          streetSuffix: '',
          streetName: 'MAIN ST',
          apartmentUnitNumber: '',
          houseFractionNumber: '',
          addressLine2: '',
          addressLine3: '',
          city: 'Manchester',
          state: 'NH',
          zipCode: '03101',
          party: 'UND',
        }),
      }),
      expect.objectContaining({
        voterId: 'oscar',
        firstName: 'Oscar',
        lastName: 'Wilde',
        nameChange: {
          ...nameChangeData,
          timestamp: expect.any(String),
        },
      }),
    ]);
  }
  // Check in all voters and sync events again.
  const allVoters = localA.getAllVotersInPrecinctSorted();
  for (const voter of allVoters) {
    localA.recordVoterCheckIn({
      voterId: voter.voterId,
      identificationMethod: { type: 'default' },
      ballotParty: 'DEM',
    });
  }
  // Sync events between all pollbooks
  syncEventsForAllPollbooks([peerA, peerB]);
  // Verify all pollbooks see all voters checked in
  expect(localA.getCheckInCount()).toEqual(3);
  expect(localB.getCheckInCount()).toEqual(3);
});

// Register a voter on one machine, check in on another, then change name/address on a third
// and verify all changes sync correctly.
test('register on A, check in on B, name/address change on C, sync all', () => {
  const [localA, peerA] = setupFileStores('pollbook-a');
  const [localB, peerB] = setupFileStores('pollbook-b');
  const [localC, peerC] = setupFileStores('pollbook-c');
  const testElectionDefinition = getTestElectionDefinition();
  const streets = [
    createValidStreetInfo('MAIN', 'even', 2, 10, '', '', 'precinct-0'),
  ];

  for (const store of [localA, localB, localC]) {
    store.setElectionAndVoters(
      testElectionDefinition,
      'mock-package-hash',
      streets,
      []
    );
    store.setConfiguredPrecinct(
      testElectionDefinition.election.precincts[0].id
    );
  }

  // Register voter on A
  const { voter } = localA.registerVoter({
    firstName: 'Reg',
    middleName: '',
    lastName: 'Tester',
    suffix: '',
    streetNumber: '4',
    streetSuffix: '',
    streetName: 'MAIN',
    apartmentUnitNumber: '',
    houseFractionNumber: '',
    addressLine2: '',
    addressLine3: '',
    city: 'Manchester',
    state: 'NH',
    zipCode: '03101',
    party: 'DEM',
    precinct: 'precinct-0',
  });
  syncEventsForAllPollbooks([peerA, peerB, peerC]);
  // Check in on B
  localB.recordVoterCheckIn({
    voterId: voter.voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  syncEventsForAllPollbooks([peerA, peerB, peerC]);
  // Name and address change on C
  localC.changeVoterName(voter.voterId, {
    firstName: 'Reginald',
    middleName: '',
    lastName: 'Tester',
    suffix: 'Jr.',
  });
  localC.changeVoterAddress(voter.voterId, {
    streetNumber: '6',
    streetSuffix: '',
    streetName: 'MAIN',
    apartmentUnitNumber: '',
    houseFractionNumber: '',
    addressLine2: '',
    addressLine3: '',
    city: 'Manchester',
    state: 'NH',
    zipCode: '03101',
    precinct: 'precinct-0',
  });
  syncEventsForAllPollbooks([peerA, peerB, peerC]);
  // All pollbooks should see all changes
  for (const store of [localA, localB, localC]) {
    const v = store.getVoter(voter.voterId);
    expect(v.checkIn).toBeDefined();
    expect(v.nameChange).toMatchObject({
      firstName: 'Reginald',
      suffix: 'Jr.',
    });
    expect(v.addressChange).toMatchObject({
      streetName: 'MAIN',
      streetNumber: '6',
    });
  }
});

// Last write wins for name/address changes, including with bad system time after sync
test('last write wins for name/address changes with bad system time after sync', () => {
  vi.useFakeTimers();
  const [localA, peerA] = setupFileStores('pollbook-a');
  const [localB, peerB] = setupFileStores('pollbook-b');
  const testElectionDefinition = getTestElectionDefinition();
  const voters = [
    createVoter('tim', 'Tim', 'Traveler'),
    createVoter('tia', 'Tia', 'Traveler'),
  ];
  const streets = [
    createValidStreetInfo('MAPLE', 'even', 2, 400, '', '', 'precinct-0'),
  ];

  for (const store of [localA, localB]) {
    store.setElectionAndVoters(
      testElectionDefinition,
      'mock-package-hash',
      streets,
      voters
    );
    store.setConfiguredPrecinct(
      testElectionDefinition.election.precincts[0].id
    );
  }
  // Name change on A at 9am
  const nineAm = new Date('2024-01-01T09:00:00Z').getTime();
  vi.setSystemTime(nineAm);
  localA.changeVoterName('tim', {
    firstName: 'Timothy',
    middleName: '',
    lastName: 'Traveler',
    suffix: '',
  });
  localA.changeVoterName('tia', {
    firstName: 'Tiara',
    middleName: '',
    lastName: 'Traveler',
    suffix: '',
  });

  // Name changes on B at 8am (bad clock)
  const eightAm = new Date('2024-01-01T08:00:00Z').getTime();
  vi.setSystemTime(eightAm);

  // Tia name change is before the sync, this will create an older event then pollbookA
  localB.changeVoterName('tia', {
    firstName: 'Tamara',
    middleName: '',
    lastName: 'Traveler',
    suffix: '',
  });

  // Sync
  syncEventsForAllPollbooks([peerA, peerB]);

  // Tim name change is after the sync, this will create a later event then pollbookA
  localB.changeVoterName('tim', {
    firstName: 'Tim',
    middleName: 'E',
    lastName: 'Traveler',
    suffix: '',
  });
  // Sync again
  syncEventsForAllPollbooks([peerA, peerB]);
  // Last write wins: both should see Tim E, and Tiara
  for (const store of [localA, localB]) {
    const v = store.getVoter('tim');
    expect(v.nameChange).toMatchObject({ firstName: 'Tim', middleName: 'E' });
    const v2 = store.getVoter('tia');
    expect(v2.nameChange).toMatchObject({ firstName: 'Tiara', middleName: '' });
  }
  // Address change on A at 10am
  const tenAm = new Date('2024-01-01T10:00:00Z').getTime();
  vi.setSystemTime(tenAm);
  localA.changeVoterAddress('tim', {
    streetNumber: '100',
    streetSuffix: '',
    streetName: 'MAPLE',
    apartmentUnitNumber: '',
    houseFractionNumber: '',
    addressLine2: '',
    addressLine3: '',
    city: 'Manchester',
    state: 'NH',
    zipCode: '03101',
    precinct: 'precinct-0',
  });
  // Address change on B at 7am (bad clock, but after sync)
  const sevenAm = new Date('2024-01-01T07:00:00Z').getTime();
  vi.setSystemTime(sevenAm);
  // Sync events so the logical clock should increment
  syncEventsFromTo(peerA, peerB);

  localB.changeVoterAddress('tim', {
    streetNumber: '200',
    streetSuffix: '',
    streetName: 'MAPLE',
    apartmentUnitNumber: '',
    houseFractionNumber: '',
    addressLine2: '',
    addressLine3: '',
    city: 'Manchester',
    state: 'NH',
    zipCode: '03101',
    precinct: 'precinct-0',
  });
  // Sync again
  syncEventsForAllPollbooks([peerA, peerB]);
  // Last write wins: both should see Oak/200
  for (const store of [localA, localB]) {
    const v = store.getVoter('tim');
    expect(v.addressChange).toMatchObject({
      streetName: 'MAPLE',
      streetNumber: '200',
    });
  }
  vi.useRealTimers();
});

// Register, check in, then change name/address, and verify sync
test('register, check in, then change name/address, sync', () => {
  const [localA, peerA] = setupFileStores('pollbook-a');
  const [localB, peerB] = setupFileStores('pollbook-b');
  const testElectionDefinition = getTestElectionDefinition();
  const streets = [
    createValidStreetInfo('PEGASUS', 'odd', 5, 15, '', '', 'precinct-0'),
  ];

  for (const store of [localA, localB]) {
    store.setElectionAndVoters(
      testElectionDefinition,
      'mock-package-hash',
      streets,
      []
    );
    store.setConfiguredPrecinct(
      testElectionDefinition.election.precincts[0].id
    );
  }
  // Register on A
  const { voter } = localA.registerVoter({
    firstName: 'Sam',
    middleName: '',
    lastName: 'Sync',
    suffix: '',
    streetNumber: '7',
    streetSuffix: '',
    streetName: 'PEGASUS',
    apartmentUnitNumber: '',
    houseFractionNumber: '',
    addressLine2: '',
    addressLine3: '',
    city: 'Manchester',
    state: 'NH',
    zipCode: '03101',
    party: 'DEM',
    precinct: 'precinct-0',
  });
  syncEventsForAllPollbooks([peerA, peerB]);
  // Check in on A
  localA.recordVoterCheckIn({
    voterId: voter.voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  // Name and address change on B
  localB.changeVoterName(voter.voterId, {
    firstName: 'Samuel',
    middleName: '',
    lastName: 'Sync',
    suffix: '',
  });
  localB.changeVoterAddress(voter.voterId, {
    streetNumber: '9',
    streetSuffix: '',
    streetName: 'PEGASUS',
    apartmentUnitNumber: '',
    houseFractionNumber: '',
    addressLine2: '',
    addressLine3: '',
    city: 'Manchester',
    state: 'NH',
    zipCode: '03101',
    precinct: 'precinct-0',
  });
  syncEventsForAllPollbooks([peerA, peerB]);
  // Both should see all changes
  for (const store of [localA, localB]) {
    const v = store.getVoter(voter.voterId);
    expect(v.checkIn).toBeDefined();
    expect(v.nameChange).toMatchObject({ firstName: 'Samuel' });
    expect(v.addressChange).toMatchObject({
      streetName: 'PEGASUS',
      streetNumber: '9',
    });
  }
});

// Simultaneous name/address changes on different machines, then sync and verify last write wins
test('simultaneous name/address changes, last write wins', async () => {
  const [localA, peerA] = setupFileStores('pollbook-a');
  const [localB, peerB] = setupFileStores('pollbook-b');
  const testElectionDefinition = getTestElectionDefinition();
  const voter = createVoter('sim', 'Sim', 'Multi');
  const streets = [
    createValidStreetInfo('PEGASUS', 'odd', 5, 15, '', '', 'precinct-0'),
  ];

  for (const store of [localA, localB]) {
    store.setElectionAndVoters(
      testElectionDefinition,
      'mock-package-hash',
      streets,
      [voter]
    );
    store.setConfiguredPrecinct(
      testElectionDefinition.election.precincts[0].id
    );
  }
  // Name change on A
  localA.changeVoterName('sim', {
    firstName: 'Simone',
    middleName: '',
    lastName: 'Multi',
    suffix: '',
  });
  // Name change on B (should win after sync)
  await sleep(10);
  localB.changeVoterName('sim', {
    firstName: 'Simon',
    middleName: '',
    lastName: 'Multi',
    suffix: '',
  });
  // Address change on A
  localA.changeVoterAddress('sim', {
    streetNumber: '11',
    streetSuffix: '',
    streetName: 'PEGASUS',
    apartmentUnitNumber: '',
    houseFractionNumber: '',
    addressLine2: '',
    addressLine3: '',
    city: 'Manchester',
    state: 'NH',
    zipCode: '03101',
    precinct: 'precinct-0',
  });
  // Address change on B (should win after sync)
  await sleep(10);
  localB.changeVoterAddress('sim', {
    streetNumber: '15',
    streetSuffix: '',
    streetName: 'PEGASUS',
    apartmentUnitNumber: '',
    houseFractionNumber: '',
    addressLine2: '',
    addressLine3: '',
    city: 'Manchester',
    state: 'NH',
    zipCode: '03101',
    precinct: 'precinct-0',
  });
  syncEventsForAllPollbooks([peerA, peerB]);
  // Both should see last write for name and address
  for (const store of [localA, localB]) {
    const v = store.getVoter('sim');
    expect(v.nameChange).toMatchObject({ firstName: 'Simon' });
    expect(v.addressChange).toMatchObject({
      streetName: 'PEGASUS',
      streetNumber: '15',
    });
  }
});

test('check in event on an offline machine BEFORE the mark inactive', async () => {
  const [localA, peerA] = setupFileStores('pollbook-a');
  const [localB, peerB] = setupFileStores('pollbook-b');
  const testElectionDefinition = getTestElectionDefinition();
  const voter = createVoter('mia', 'Mia', 'Inactive');

  for (const store of [localA, localB]) {
    store.setElectionAndVoters(
      testElectionDefinition,
      'mock-package-hash',
      [],
      [voter]
    );
    store.setConfiguredPrecinct(
      testElectionDefinition.election.precincts[0].id
    );
  }
  // Sync initial state
  syncEventsForAllPollbooks([peerA, peerB]);
  // PollbookB goes offline
  peerB.setOnlineStatus(false);
  // Check in on B while offline
  localB.recordVoterCheckIn({
    voterId: 'mia',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  // Wait a bit to ensure the last event is before the next event.
  await sleep(10);
  // Mark inactive on A
  localA.markVoterInactive('mia');
  // Bring B online and sync
  peerB.setOnlineStatus(true);
  syncEventsForAllPollbooks([peerA, peerB]);
  // Both should see voter as inactive and checked in
  for (const store of [localA, localB]) {
    const v = store.getVoter('mia');
    expect(v.isInactive).toEqual(true);
    expect(v.checkIn).toBeDefined();
    expect(store.getCheckInCount()).toEqual(1);
  }
});

test('check in event on an offline machine AFTER the mark inactive', async () => {
  const [localA, peerA] = setupFileStores('pollbook-a');
  const [localB, peerB] = setupFileStores('pollbook-b');
  const testElectionDefinition = getTestElectionDefinition();
  const voter = createVoter('nia', 'Nia', 'Inactive');

  for (const store of [localA, localB]) {
    store.setElectionAndVoters(
      testElectionDefinition,
      'mock-package-hash',
      [],
      [voter]
    );
    store.setConfiguredPrecinct(
      testElectionDefinition.election.precincts[0].id
    );
  }
  syncEventsForAllPollbooks([peerA, peerB]);

  // PollbookB goes offline
  peerB.setOnlineStatus(false);
  // Mark inactive on A
  localA.markVoterInactive('nia');
  // Wait a bit of time.
  await sleep(10);
  // Check in on B while offline
  localB.recordVoterCheckIn({
    voterId: 'nia',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  // Bring B online and sync
  peerB.setOnlineStatus(true);
  syncEventsForAllPollbooks([peerA, peerB]);
  // Both should see voter as inactive and checked in
  for (const store of [localA, localB]) {
    const v = store.getVoter('nia');
    expect(v.isInactive).toEqual(true);
    expect(v.checkIn).toBeDefined();
    expect(store.getCheckInCount()).toEqual(1);
  }
});

test('name/address change AFTER mark inactive on another machine get processed', async () => {
  const streets = [
    createValidStreetInfo('INACTIVE', 'all', 0, 100, '', '', 'precinct-0'),
  ];
  const [localA, peerA] = setupFileStores('pollbook-a');
  const [localB, peerB] = setupFileStores('pollbook-b');
  const testElectionDefinition = getTestElectionDefinition();
  const voter = createVoter('kai', 'Kai', 'Inactive');

  for (const store of [localA, localB]) {
    store.setElectionAndVoters(
      testElectionDefinition,
      'mock-package-hash',
      streets,
      [voter]
    );
    store.setConfiguredPrecinct(
      testElectionDefinition.election.precincts[0].id
    );
  }

  syncEventsForAllPollbooks([peerA, peerB]);

  // Pollbook B offline
  peerB.setOnlineStatus(false);

  // Mark inactive on A
  localA.markVoterInactive('kai');

  // Wait a bit of time.
  await sleep(10);
  // Name/address change on B after mark inactive
  localB.changeVoterName('kai', {
    firstName: 'Kaiser',
    middleName: '',
    lastName: 'Inactive',
    suffix: '',
  });
  localB.changeVoterAddress('kai', {
    streetNumber: '99',
    streetSuffix: '',
    streetName: 'INACTIVE',
    apartmentUnitNumber: '',
    houseFractionNumber: '',
    addressLine2: '',
    addressLine3: '',
    city: 'Nowhere',
    state: 'NH',
    zipCode: '00000',
    precinct: 'precinct-0',
  });

  peerB.setOnlineStatus(true);
  syncEventsForAllPollbooks([peerA, peerB]);
  // Both should see voter as inactive, with name/address change
  for (const store of [localA, localB]) {
    const v = store.getVoter('kai');
    expect(v.isInactive).toEqual(true);
    expect(v.nameChange).toMatchObject({ firstName: 'Kaiser' });
    expect(v.addressChange).toMatchObject({
      streetName: 'INACTIVE',
      streetNumber: '99',
    });
  }
});

test('can check in after mark inactive event is synced', () => {
  const [localA, peerA] = setupFileStores('pollbook-a');
  const [localB, peerB] = setupFileStores('pollbook-b');
  const testElectionDefinition = getTestElectionDefinition();
  const voter = createVoter('ina', 'Ina', 'Active');
  for (const store of [localA, localB]) {
    store.setElectionAndVoters(
      testElectionDefinition,
      'mock-package-hash',
      [],
      [voter]
    );
    store.setConfiguredPrecinct(
      testElectionDefinition.election.precincts[0].id
    );
  }
  syncEventsForAllPollbooks([peerA, peerB]);
  // Mark inactive on A
  localA.markVoterInactive('ina');
  syncEventsForAllPollbooks([peerA, peerB]);
  // Check in on B (should be allowed)
  localB.recordVoterCheckIn({
    voterId: 'ina',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  syncEventsForAllPollbooks([peerA, peerB]);
  // Both should see voter as inactive AND checked in
  for (const store of [localA, localB]) {
    const v = store.getVoter('ina');
    expect(v.isInactive).toEqual(true);
    expect(v.checkIn).toBeDefined();
  }
});
