import {
  electionMinimalExhaustiveSampleDefinition,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import { safeParseSystemSettings } from '@votingworks/utils';
import { find, typedAs } from '@votingworks/basics';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpNameSync } from 'tmp';
import { ContestTally, ManualTally } from '@votingworks/types';
import { Store, replacePartyIdFilter } from './store';
import { ElectionRecord, ManualTallyBallotType, ScannerBatch } from './types';

test('replacePartyIdFilter', () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;

  expect(
    replacePartyIdFilter(
      {
        partyIds: ['0'],
      },
      election
    )
  ).toEqual({
    ballotStyleIds: ['1M'],
  });

  expect(
    replacePartyIdFilter(
      {
        partyIds: ['0', '1'],
      },
      election
    )
  ).toEqual({
    ballotStyleIds: ['1M', '2F'],
  });

  // doesn't touch other filters when no party id
  expect(
    replacePartyIdFilter(
      {
        ballotStyleIds: ['1M', '2F'],
        votingMethods: ['absentee'],
      },
      election
    )
  ).toEqual({
    ballotStyleIds: ['1M', '2F'],
    votingMethods: ['absentee'],
  });

  // intersects explicit ballot style ids and implied ballot style ids
  expect(
    replacePartyIdFilter(
      {
        partyIds: ['0'],
        ballotStyleIds: ['1M', '2F'],
      },
      election
    )
  ).toEqual({
    ballotStyleIds: ['1M'],
  });
});

test('create a file store', async () => {
  const tmpDir = tmpNameSync();
  await fs.mkdir(tmpDir);
  const tmpDbPath = join(tmpDir, 'ballots.db');
  const store = Store.fileStore(tmpDbPath);

  expect(store).toBeInstanceOf(Store);
  expect(store.getDbPath()).toEqual(tmpDbPath);
});

test('create a memory store', () => {
  const store = Store.memoryStore();
  expect(store).toBeInstanceOf(Store);
  expect(store.getDbPath()).toEqual(':memory:');
});

test('add an election', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  store.assertElectionExists(electionId);
  expect(store.getElections().map((r) => r.id)).toContain(electionId);
  expect(store.getElection(electionId)).toMatchObject({
    electionDefinition: expect.anything(),
    id: electionId,
    createdAt: expect.anything(),
  });
  expect(store.getElection('not-an-id')).toEqual(undefined);
});

test('assert election exists', () => {
  const store = Store.memoryStore();
  expect(() => store.assertElectionExists('foo')).toThrowError(
    'Election not found: foo'
  );
});

test('setElectionResultsOfficial', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  expect(store.getElection(electionId)).toEqual(
    expect.objectContaining(
      typedAs<Partial<ElectionRecord>>({
        isOfficialResults: false,
      })
    )
  );

  store.setElectionResultsOfficial(electionId, true);

  expect(store.getElection(electionId)).toEqual(
    expect.objectContaining(
      typedAs<Partial<ElectionRecord>>({
        isOfficialResults: true,
      })
    )
  );

  store.setElectionResultsOfficial(electionId, false);

  expect(store.getElection(electionId)).toEqual(
    expect.objectContaining(
      typedAs<Partial<ElectionRecord>>({
        isOfficialResults: false,
      })
    )
  );
});

test('current election id', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  expect(store.getCurrentElectionId()).toBeUndefined();

  store.setCurrentElectionId(electionId);
  expect(store.getCurrentElectionId()).toEqual(electionId);

  store.setCurrentElectionId(undefined);
  expect(store.getCurrentElectionId()).toBeUndefined();
});

/**
 * System settings tests
 */
function makeSystemSettings() {
  return safeParseSystemSettings(
    electionMinimalExhaustiveSampleFixtures.systemSettings.asText()
  ).unsafeUnwrap();
}

test('saveSystemSettings and getSystemSettings write and read system settings', () => {
  const store = Store.memoryStore();
  const systemSettings = makeSystemSettings();
  store.saveSystemSettings(systemSettings);
  const retrievedSystemSettings = store.getSystemSettings();
  expect(retrievedSystemSettings).toEqual(systemSettings);
});

test('getSystemSettings returns undefined when no system settings exist', () => {
  const store = Store.memoryStore();
  const retrievedSystemSettings = store.getSystemSettings();
  expect(retrievedSystemSettings).toBeUndefined();
});

test('scanner batches', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  expect(store.getScannerBatches(electionId)).toEqual([]);

  const scannerBatch: ScannerBatch = {
    electionId,
    batchId: 'batch-1',
    label: 'Batch 1',
    scannerId: 'VX-00-001',
  };
  store.addScannerBatch(scannerBatch);
  expect(store.getScannerBatches(electionId)).toEqual([scannerBatch]);

  store.deleteEmptyScannerBatches(electionId);
  expect(store.getScannerBatches(electionId)).toEqual([]);
});

test('manual tallies', () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const { electionData, election } = electionDefinition;

  const store = Store.memoryStore();
  const electionId = store.addElection(electionData);
  const contestId = 'zoo-council-mammal';
  const writeInCandidate = store.addWriteInCandidate({
    electionId,
    contestId,
    name: 'Mr. Pickles',
  });
  expect(store.getWriteInCandidates({ electionId })).toHaveLength(1);

  const contest = find(election.contests, (c) => c.id === contestId);
  const contestTally: ContestTally = {
    contest,
    tallies: {
      [writeInCandidate.id]: {
        tally: 10,
        option: {
          id: writeInCandidate.id,
          name: writeInCandidate.name,
          isWriteIn: true,
        },
      },
    },
    metadata: {
      undervotes: 20,
      overvotes: 0,
      ballots: 10,
    },
  };
  const manualTally: ManualTally = {
    numberOfBallotsCounted: 10,
    contestTallies: {
      [contestId]: contestTally,
    },
  };
  const precinctId = 'precinct-1';
  const ballotStyleId = '1M';
  const ballotType: ManualTallyBallotType = 'precinct';

  store.setManualTally({
    electionId,
    precinctId,
    ballotStyleId,
    ballotType,
    manualTally,
  });
  expect(store.getManualTallies({ electionId })).toMatchObject([
    { precinctId, ballotStyleId, ballotType, manualTally },
  ]);
  expect(
    store.getManualTallies({
      electionId,
      precinctId,
      ballotStyleId,
      ballotType,
    })
  ).toMatchObject([{ precinctId, ballotStyleId, ballotType, manualTally }]);
  expect(store.getWriteInCandidates({ electionId })).toHaveLength(1);

  // update the tally, without changing the write-in candidate reference
  const editedManualTally: ManualTally = {
    ...manualTally,
    numberOfBallotsCounted: 11,
  };
  store.setManualTally({
    electionId,
    precinctId,
    ballotStyleId,
    ballotType,
    manualTally: editedManualTally,
  });
  expect(store.getManualTallies({ electionId })).toMatchObject([
    { precinctId, ballotStyleId, ballotType, manualTally: editedManualTally },
  ]);
  expect(store.getWriteInCandidates({ electionId })).toHaveLength(1);

  // update the tally, and change the write-in candidate reference
  const noWriteInManualTally: ManualTally = {
    numberOfBallotsCounted: 11,
    contestTallies: {
      ...manualTally.contestTallies,
      [contestId]: {
        ...contestTally,
        tallies: {},
      },
    },
  };
  store.setManualTally({
    electionId,
    precinctId,
    ballotStyleId,
    ballotType,
    manualTally: noWriteInManualTally,
  });
  expect(store.getManualTallies({ electionId })).toMatchObject([
    {
      precinctId,
      ballotStyleId,
      ballotType,
      manualTally: noWriteInManualTally,
    },
  ]);
  // write-in should be deleted as it has no references anymore
  expect(store.getWriteInCandidates({ electionId })).toHaveLength(0);

  store.deleteAllManualTallies({ electionId });
  expect(store.getManualTallies({ electionId })).toEqual([]);
});
