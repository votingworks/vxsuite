import { Admin } from '@votingworks/api';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { CastVoteRecord } from '@votingworks/types';
import { typedAs } from '@votingworks/utils';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpNameSync } from 'tmp';
import { AddCastVoteRecordError, Store } from './store';
import { getWriteInsFromCastVoteRecord } from './util/cvrs';

test('create a file store', async () => {
  const tmpDir = tmpNameSync();
  await fs.mkdir(tmpDir);
  const tmpDbPath = join(tmpDir, 'ballots.db');
  const store = Store.fileStore(tmpDbPath);

  expect(store).toBeInstanceOf(Store);
  expect(store.getDbPath()).toBe(tmpDbPath);
});

test('create a memory store', () => {
  const store = Store.memoryStore();
  expect(store).toBeInstanceOf(Store);
  expect(store.getDbPath()).toBe(':memory:');
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
  expect(store.getElection('not-an-id')).toBe(undefined);
});

test('assert election exists', () => {
  const store = Store.memoryStore();
  expect(() => store.assertElectionExists('foo')).toThrowError(
    'Election not found: foo'
  );
});

test('add a CVR file', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const cvrFile = electionMinimalExhaustiveSampleFixtures.cvrData;
  expect(
    store
      .addCastVoteRecordFile({ electionId, filename: 'cvrs.jsonl', cvrFile })
      .unsafeUnwrap()
  ).toEqual({
    id: expect.stringMatching(/^[-0-9a-f]+$/),
    wasExistingFile: false,
    newlyAdded: 3000,
    alreadyPresent: 0,
  });

  const writeInCount = cvrFile.split('\n').reduce((acc, line) => {
    if (line.trim().length === 0) {
      return acc;
    }

    const cvr = JSON.parse(line) as CastVoteRecord;
    return acc + [...getWriteInsFromCastVoteRecord(cvr).values()].flat().length;
  }, 0);

  expect(store.getWriteInRecords({ electionId })).toHaveLength(writeInCount);
});

test('add a duplicate CVR file', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const cvrFile = electionMinimalExhaustiveSampleFixtures.cvrData;
  const originalResult = store
    .addCastVoteRecordFile({ electionId, filename: 'cvrs.jsonl', cvrFile })
    .unsafeUnwrap();
  expect(originalResult).toEqual({
    id: expect.stringMatching(/^[-0-9a-f]+$/),
    wasExistingFile: false,
    newlyAdded: 3000,
    alreadyPresent: 0,
  });
  const duplicateResult = store
    .addCastVoteRecordFile({ electionId, filename: 'cvrs.jsonl', cvrFile })
    .unsafeUnwrap();
  expect(duplicateResult).toEqual({
    id: originalResult.id,
    wasExistingFile: true,
    newlyAdded: 0,
    alreadyPresent: 3000,
  });
});

test('analyze a CVR file', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const cvrFile = electionMinimalExhaustiveSampleFixtures.cvrData;
  expect(
    store
      .addCastVoteRecordFile({
        electionId,
        filename: 'cvrs.jsonl',
        cvrFile,
        analyzeOnly: true,
      })
      .unsafeUnwrap()
  ).toEqual({
    id: expect.any(String),
    wasExistingFile: false,
    newlyAdded: 3000,
    alreadyPresent: 0,
  });

  // analyzing does not add to the store
  expect(store.getCastVoteRecordEntries(electionId)).toHaveLength(0);
});

test('adding a CVR file if adding an entry fails', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const cvrFile = electionMinimalExhaustiveSampleFixtures.cvrData;

  jest.spyOn(store, 'addCastVoteRecordFileEntry').mockImplementation(() => {
    throw new Error('oops');
  });

  expect(() =>
    store
      .addCastVoteRecordFile({
        electionId,
        filename: 'cvrs.jsonl',
        cvrFile,
      })
      .unsafeUnwrap()
  ).toThrowError('oops');

  expect(store.getCastVoteRecordEntries(electionId)).toHaveLength(0);
});

test('add a CVR file entry without a ballot ID', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const cvrFile = electionMinimalExhaustiveSampleFixtures.cvrData.replaceAll(
    '_ballotId',
    '_notBallotId'
  );

  const result = store.addCastVoteRecordFile({
    electionId,
    filename: 'cvrs.jsonl',
    cvrFile,
  });

  expect(result.isErr()).toBe(true);
  expect(result.unsafeUnwrapErr()).toEqual(
    typedAs<AddCastVoteRecordError>({ kind: 'BallotIdRequired' })
  );
});

test('get CVR file metadata', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const cvrFile = electionMinimalExhaustiveSampleFixtures.cvrData;

  expect(
    store.getCastVoteRecordFileMetadata('not a CVR file ID')
  ).toBeUndefined();

  const { id } = store
    .addCastVoteRecordFile({
      electionId,
      filename: 'cvrs.jsonl',
      cvrFile,
    })
    .unsafeUnwrap();

  const cvrFileMetadata = store.getCastVoteRecordFileMetadata(id);
  expect(cvrFileMetadata).toEqual(
    typedAs<Admin.CastVoteRecordFileMetadata>({
      id,
      electionId,
      filename: 'cvrs.jsonl',
      sha256Hash: expect.any(String),
      createdAt: expect.any(String),
    })
  );
});

test('get CVR file', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const cvrFile = electionMinimalExhaustiveSampleFixtures.cvrData;

  expect(store.getCastVoteRecordFile('not a CVR file ID')).toBeUndefined();

  const { id } = store
    .addCastVoteRecordFile({
      electionId,
      filename: 'cvrs.jsonl',
      cvrFile,
    })
    .unsafeUnwrap();

  const cvrFileMetadata = store.getCastVoteRecordFile(id);
  expect(cvrFileMetadata).toEqual(
    typedAs<Admin.CastVoteRecordFileRecord>({
      id,
      electionId,
      filename: 'cvrs.jsonl',
      data: cvrFile,
      sha256Hash: expect.any(String),
      createdAt: expect.any(String),
    })
  );
});

test('get write-in adjudication records', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const { cvrData } = electionMinimalExhaustiveSampleFixtures;

  store
    .addCastVoteRecordFile({
      electionId,
      filename: 'cvrs.jsonl',
      // add the first two CVRs, which do not have write-ins
      cvrFile: cvrData.slice(
        0,
        cvrData.indexOf('\n', cvrData.indexOf('\n') + 1) + 1
      ),
    })
    .unsafeUnwrap();

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

test('write-in adjudication lifecycle', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const { cvrData } = electionMinimalExhaustiveSampleFixtures;

  store
    .addCastVoteRecordFile({
      electionId,
      filename: 'cvrs.jsonl',
      // add the first two CVRs, which do not have write-ins
      cvrFile: cvrData.slice(
        0,
        cvrData.indexOf('\n', cvrData.indexOf('\n') + 1) + 1
      ),
    })
    .unsafeUnwrap();

  const castVoteRecordId = store.getCastVoteRecordEntries(electionId)[0]!.id;
  const writeInId = store.addWriteIn({
    castVoteRecordId,
    contestId: 'zoo-council-mammal',
    optionId: 'write-in-0',
  });

  expect(store.getWriteInAdjudicationSummary({ electionId })).toEqual(
    typedAs<Admin.WriteInSummaryEntry[]>([
      {
        contestId: 'zoo-council-mammal',
        writeInCount: 1,
      },
    ])
  );

  store.transcribeWriteIn(writeInId, 'Mickey Mouse');

  expect(store.getWriteInAdjudicationSummary({ electionId })).toEqual(
    typedAs<Admin.WriteInSummaryEntry[]>([
      {
        contestId: 'zoo-council-mammal',
        transcribedValue: 'Mickey Mouse',
        writeInCount: 1,
      },
    ])
  );

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
      _ballotId: 'id-0',
    }),
  });

  expect(store.getCastVoteRecordForWriteIn('not-an-id')).toBe(undefined);

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
        contestId: 'zoo-council-mammal',
        transcribedValue: 'Mickey Mouse',
        writeInCount: 1,
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
        contestId: 'zoo-council-mammal',
        transcribedValue: 'Mickey Mouse',
        writeInCount: 1,
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
      "write_in_adjudications" => 0,
      "write_ins" => 0,
    }
  `);
});
