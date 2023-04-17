import { Admin } from '@votingworks/api';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import {
  arbitraryBallotStyleId,
  arbitraryPrecinctId,
} from '@votingworks/test-utils';
import { safeParseSystemSettings } from '@votingworks/utils';
import { typedAs } from '@votingworks/basics';
import fc from 'fast-check';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpNameSync } from 'tmp';
import { Store } from './store';
import { addCastVoteRecordReport } from './cvr_files';
import { modifyCastVoteRecordReport } from '../test/utils';

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

test('get write-in adjudication records', async () => {
  const { castVoteRecordReport } = electionMinimalExhaustiveSampleFixtures;

  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  store.setCurrentElectionId(electionId);

  // add the first two CVRs, which do not have write-ins
  await addCastVoteRecordReport({
    store,
    reportDirectoryPath: await modifyCastVoteRecordReport(
      castVoteRecordReport.asDirectoryPath(),
      ({ CVR }) => ({ CVR: CVR.take(2) })
    ),
    exportedTimestamp: '2021-09-02T22:27:58.327Z',
  });

  const castVoteRecordId = store.getCastVoteRecordEntries(electionId)[0]!.id;
  const writeInAdjudicationRecords = store.getWriteInRecords({
    electionId,
  });
  expect(writeInAdjudicationRecords).toHaveLength(0);

  const zooCouncilMammalWriteInAdjudicationId = store.addWriteIn({
    castVoteRecordId,
    contestId: 'zoo-council-mammal',
    optionId: 'write-in-0',
  });

  expect(store.getWriteInRecords({ electionId })).toEqual(
    typedAs<Admin.WriteInRecord[]>([
      {
        id: zooCouncilMammalWriteInAdjudicationId,
        contestId: 'zoo-council-mammal',
        optionId: 'write-in-0',
        castVoteRecordId,
        status: 'pending',
      },
    ])
  );

  // wrong contest
  expect(
    store.getWriteInRecords({
      electionId,
      contestId: 'aquarium-council-fish',
    })
  ).toHaveLength(0);

  // right contest
  expect(
    store.getWriteInRecords({
      electionId,
      contestId: 'zoo-council-mammal',
    })
  ).toHaveLength(1);

  // wrong status
  expect(
    store.getWriteInRecords({
      electionId,
      status: 'adjudicated',
    })
  ).toHaveLength(0);
  expect(
    store.getWriteInRecords({
      electionId,
      status: 'transcribed',
    })
  ).toHaveLength(0);

  // right status
  expect(
    store.getWriteInRecords({
      electionId,
      status: 'pending',
    })
  ).toHaveLength(1);

  const aquariumCouncilFishWriteInAdjudicationId = store.addWriteIn({
    castVoteRecordId,
    contestId: 'aquarium-council-fish',
    optionId: 'write-in-0',
  });

  expect(
    store
      .getWriteInRecords({ electionId })
      .map(({ id }) => id)
      .sort()
  ).toEqual(
    [
      zooCouncilMammalWriteInAdjudicationId,
      aquariumCouncilFishWriteInAdjudicationId,
    ].sort()
  );

  expect(
    store.getWriteInRecords({
      electionId,
      limit: 1,
    })
  ).toHaveLength(1);
});

test('write-in adjudication lifecycle', async () => {
  const { castVoteRecordReport } = electionMinimalExhaustiveSampleFixtures;

  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  store.setCurrentElectionId(electionId);

  // add the first two CVRs, which do not have write-ins
  await addCastVoteRecordReport({
    store,
    reportDirectoryPath: await modifyCastVoteRecordReport(
      castVoteRecordReport.asDirectoryPath(),
      ({ CVR }) => ({ CVR: CVR.take(2) })
    ),
    exportedTimestamp: '2021-09-02T22:27:58.327Z',
  });

  const castVoteRecordId = store.getCastVoteRecordEntries(electionId)[0]!.id;
  const writeInId = store.addWriteIn({
    castVoteRecordId,
    contestId: 'zoo-council-mammal',
    optionId: 'write-in-0',
  });

  expect(store.getWriteInAdjudicationSummary({ electionId })).toEqual(
    typedAs<Admin.WriteInSummaryEntry[]>([
      {
        status: 'pending',
        contestId: 'zoo-council-mammal',
        writeInCount: 1,
      },
    ])
  );

  expect(
    store.getWriteInAdjudicationSummary({ electionId, status: 'pending' })
  ).toHaveLength(1);

  expect(
    store.getWriteInAdjudicationSummary({ electionId, status: 'transcribed' })
  ).toHaveLength(0);

  expect(
    store.getWriteInAdjudicationSummary({ electionId, status: 'adjudicated' })
  ).toHaveLength(0);

  store.transcribeWriteIn(writeInId, 'Mickey Mouse');

  expect(store.getWriteInAdjudicationSummary({ electionId })).toEqual(
    typedAs<Admin.WriteInSummaryEntry[]>([
      {
        status: 'transcribed',
        contestId: 'zoo-council-mammal',
        writeInCount: 1,
        transcribedValue: 'Mickey Mouse',
      },
    ])
  );

  expect(
    store.getWriteInAdjudicationSummary({ electionId, status: 'pending' })
  ).toHaveLength(0);

  expect(
    store.getWriteInAdjudicationSummary({ electionId, status: 'transcribed' })
  ).toHaveLength(1);

  expect(
    store.getWriteInAdjudicationSummary({ electionId, status: 'adjudicated' })
  ).toHaveLength(0);

  expect(
    store.getWriteInRecords({
      electionId,
      status: 'pending',
    })
  ).toHaveLength(0);
  expect(
    store.getWriteInRecords({
      electionId,
      status: 'transcribed',
    })
  ).toEqual([
    {
      id: writeInId,
      contestId: 'zoo-council-mammal',
      optionId: 'write-in-0',
      castVoteRecordId,
      status: 'transcribed',
      transcribedValue: 'Mickey Mouse',
    },
  ]);

  expect(store.getCastVoteRecordForWriteIn(writeInId)).toMatchObject({
    writeInId,
    contestId: 'zoo-council-mammal',
    optionId: 'write-in-0',
    cvr: expect.objectContaining({
      _ballotId: '0',
    }),
  });

  expect(store.getCastVoteRecordForWriteIn('not-an-id')).toEqual(undefined);

  const firstWriteInAdjudicationId = store.createWriteInAdjudication({
    electionId,
    contestId: 'zoo-council-mammal',
    transcribedValue: 'Mickey Mouse',
    adjudicatedValue: 'Zebra',
    adjudicatedOptionId: 'zebra',
  });

  expect(
    store.getWriteInRecords({
      electionId,
      status: 'transcribed',
    })
  ).toHaveLength(0);
  expect(
    store.getWriteInRecords({
      electionId,
      status: 'adjudicated',
    })
  ).toEqual(
    typedAs<Admin.WriteInRecord[]>([
      {
        id: writeInId,
        contestId: 'zoo-council-mammal',
        optionId: 'write-in-0',
        castVoteRecordId,
        status: 'adjudicated',
        transcribedValue: 'Mickey Mouse',
        adjudicatedValue: 'Zebra',
        adjudicatedOptionId: 'zebra',
      },
    ])
  );

  expect(store.getWriteInAdjudicationSummary({ electionId })).toEqual(
    typedAs<Admin.WriteInSummaryEntry[]>([
      {
        status: 'adjudicated',
        contestId: 'zoo-council-mammal',
        writeInCount: 1,
        transcribedValue: 'Mickey Mouse',
        writeInAdjudication: {
          id: firstWriteInAdjudicationId,
          contestId: 'zoo-council-mammal',
          transcribedValue: 'Mickey Mouse',
          adjudicatedValue: 'Zebra',
          adjudicatedOptionId: 'zebra',
        },
      },
    ])
  );

  const secondWriteInAdjudicationId = store.createWriteInAdjudication({
    electionId,
    contestId: 'zoo-council-mammal',
    transcribedValue: 'Mickey Mouse',
    adjudicatedValue: 'Mickey Mouse',
  });

  // the first adjudication is updated
  expect(secondWriteInAdjudicationId).toEqual(firstWriteInAdjudicationId);

  expect(
    store.getWriteInRecords({
      electionId,
      status: 'transcribed',
    })
  ).toHaveLength(0);
  expect(
    store.getWriteInRecords({
      electionId,
      status: 'adjudicated',
    })
  ).toEqual(
    typedAs<Admin.WriteInRecord[]>([
      {
        id: writeInId,
        contestId: 'zoo-council-mammal',
        optionId: 'write-in-0',
        castVoteRecordId,
        status: 'adjudicated',
        transcribedValue: 'Mickey Mouse',
        adjudicatedValue: 'Mickey Mouse',
      },
    ])
  );

  expect(store.getWriteInAdjudicationSummary({ electionId })).toEqual(
    typedAs<Admin.WriteInSummaryEntry[]>([
      {
        status: 'adjudicated',
        contestId: 'zoo-council-mammal',
        writeInCount: 1,
        transcribedValue: 'Mickey Mouse',
        writeInAdjudication: {
          id: firstWriteInAdjudicationId,
          contestId: 'zoo-council-mammal',
          transcribedValue: 'Mickey Mouse',
          adjudicatedValue: 'Mickey Mouse',
        },
      },
    ])
  );

  store.updateWriteInAdjudication(firstWriteInAdjudicationId, {
    adjudicatedValue: 'Modest Mouse',
    adjudicatedOptionId: 'modest-mouse',
  });

  expect(
    store.getWriteInRecords({
      electionId,
      status: 'transcribed',
    })
  ).toHaveLength(0);
  expect(
    store.getWriteInRecords({
      electionId,
      status: 'adjudicated',
    })
  ).toEqual(
    typedAs<Admin.WriteInRecord[]>([
      {
        id: writeInId,
        contestId: 'zoo-council-mammal',
        optionId: 'write-in-0',
        castVoteRecordId,
        status: 'adjudicated',
        transcribedValue: 'Mickey Mouse',
        adjudicatedValue: 'Modest Mouse',
        adjudicatedOptionId: 'modest-mouse',
      },
    ])
  );

  store.deleteWriteInAdjudication(firstWriteInAdjudicationId);

  expect(
    store.getWriteInRecords({
      electionId,
      status: 'transcribed',
    })
  ).toEqual(
    typedAs<Admin.WriteInRecord[]>([
      {
        id: writeInId,
        contestId: 'zoo-council-mammal',
        optionId: 'write-in-0',
        castVoteRecordId,
        status: 'transcribed',
        transcribedValue: 'Mickey Mouse',
      },
    ])
  );

  store.createWriteInAdjudication({
    electionId,
    contestId: 'zoo-council-mammal',
    transcribedValue: 'Mickey Mouse',
    adjudicatedValue: 'Mickey Mouse',
  });

  expect(store.getDebugSummary()).toMatchInlineSnapshot(`
    Map {
      "cvr_file_entries" => 2,
      "cvr_files" => 1,
      "cvrs" => 2,
      "elections" => 1,
      "printed_ballots" => 0,
      "settings" => 1,
      "system_settings" => 0,
      "write_in_adjudications" => 1,
      "write_ins" => 1,
    }
  `);

  store.deleteCastVoteRecordFiles(electionId);

  expect(store.getDebugSummary()).toMatchInlineSnapshot(`
    Map {
      "cvr_file_entries" => 0,
      "cvr_files" => 0,
      "cvrs" => 0,
      "elections" => 1,
      "printed_ballots" => 0,
      "settings" => 1,
      "system_settings" => 0,
      "write_in_adjudications" => 0,
      "write_ins" => 0,
    }
  `);
});

test('setElectionResultsOfficial', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  expect(store.getElection(electionId)).toEqual(
    expect.objectContaining(
      typedAs<Partial<Admin.ElectionRecord>>({
        isOfficialResults: false,
      })
    )
  );

  store.setElectionResultsOfficial(electionId, true);

  expect(store.getElection(electionId)).toEqual(
    expect.objectContaining(
      typedAs<Partial<Admin.ElectionRecord>>({
        isOfficialResults: true,
      })
    )
  );

  store.setElectionResultsOfficial(electionId, false);

  expect(store.getElection(electionId)).toEqual(
    expect.objectContaining(
      typedAs<Partial<Admin.ElectionRecord>>({
        isOfficialResults: false,
      })
    )
  );
});

test('printed ballots', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  fc.assert(
    fc.property(
      fc.record({
        ballotStyleId: arbitraryBallotStyleId(),
        precinctId: arbitraryPrecinctId(),
        ballotMode: fc.constantFrom(...Object.values(Admin.BallotMode)),
        ballotType: fc.constantFrom<Admin.PrintableBallotType>(
          'standard',
          'absentee'
        ),
        numCopies: fc.integer({ min: 1, max: 10 }),
      }),
      (printedBallot) => {
        store.clearPrintedBallots(electionId);
        const printedBallotId = store.addPrintedBallot(
          electionId,
          printedBallot
        );

        expect(store.getPrintedBallots(electionId)).toEqual(
          typedAs<Admin.PrintedBallotRecord[]>([
            {
              id: printedBallotId,
              electionId,
              createdAt: expect.any(String),
              ...printedBallot,
            },
          ])
        );

        expect(
          store.getPrintedBallots(electionId, {
            ballotMode:
              printedBallot.ballotMode === Admin.BallotMode.Draft
                ? Admin.BallotMode.Sample
                : Admin.BallotMode.Draft,
          })
        ).toHaveLength(0);

        expect(
          store.getPrintedBallots(electionId, {
            ballotMode: printedBallot.ballotMode,
          })
        ).toHaveLength(1);

        store.clearPrintedBallots(electionId);
        expect(store.getPrintedBallots(electionId)).toHaveLength(0);
      }
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
  expect(retrievedSystemSettings?.arePollWorkerCardPinsEnabled).toEqual(
    systemSettings.arePollWorkerCardPinsEnabled
  );
});

test('getSystemSettings returns undefined when no system settings exist', () => {
  const store = Store.memoryStore();
  const retrievedSystemSettings = store.getSystemSettings();
  expect(retrievedSystemSettings).toBeUndefined();
});
