import { Admin } from '@votingworks/api';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import {
  arbitraryBallotLocale,
  arbitraryBallotStyleId,
  arbitraryPrecinctId,
} from '@votingworks/test-utils';
import { CastVoteRecord } from '@votingworks/types';
import { typedAs } from '@votingworks/utils';
import fc from 'fast-check';
import { promises as fs } from 'fs';
import { join } from 'path';
import { fileSync, tmpNameSync } from 'tmp';
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

test('add a CVR file', async () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const cvrFile =
    electionMinimalExhaustiveSampleFixtures.standardCvrFile.asFilePath();
  expect(
    (
      await store.addCastVoteRecordFile({
        electionId,
        filePath: cvrFile,
        originalFilename: 'cvrs.jsonl',
      })
    ).unsafeUnwrap()
  ).toEqual({
    id: expect.stringMatching(/^[-0-9a-f]+$/),
    wasExistingFile: false,
    newlyAdded: 3000,
    alreadyPresent: 0,
  });

  const writeInCount = (await fs.readFile(cvrFile, 'utf-8'))
    .split('\n')
    .reduce((acc, line) => {
      if (line.trim().length === 0) {
        return acc;
      }

      const cvr = JSON.parse(line) as CastVoteRecord;
      return (
        acc + [...getWriteInsFromCastVoteRecord(cvr).values()].flat().length
      );
    }, 0);

  expect(store.getWriteInRecords({ electionId })).toHaveLength(writeInCount);
});

test('add a CVR file with empty lines', async () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const tmpfile = fileSync();
  const { cvrData } = electionMinimalExhaustiveSampleFixtures;
  const cvrFile = tmpfile.name;

  await fs.writeFile(cvrFile, cvrData.split('\n').join('\n\n'));

  expect(
    (
      await store.addCastVoteRecordFile({
        electionId,
        filePath: cvrFile,
        originalFilename: 'cvrs.jsonl',
      })
    ).unsafeUnwrap()
  ).toEqual({
    id: expect.stringMatching(/^[-0-9a-f]+$/),
    wasExistingFile: false,
    newlyAdded: 3000,
    alreadyPresent: 0,
  });

  const writeInCount = (await fs.readFile(cvrFile, 'utf-8'))
    .split('\n')
    .reduce((acc, line) => {
      if (line.trim().length === 0) {
        return acc;
      }

      const cvr = JSON.parse(line) as CastVoteRecord;
      return (
        acc + [...getWriteInsFromCastVoteRecord(cvr).values()].flat().length
      );
    }, 0);

  expect(store.getWriteInRecords({ electionId })).toHaveLength(writeInCount);
});

test('add a duplicate CVR file', async () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const cvrFile =
    electionMinimalExhaustiveSampleFixtures.standardCvrFile.asFilePath();
  const originalResult = (
    await store.addCastVoteRecordFile({ electionId, filePath: cvrFile })
  ).unsafeUnwrap();
  expect(originalResult).toEqual({
    id: expect.stringMatching(/^[-0-9a-f]+$/),
    wasExistingFile: false,
    newlyAdded: 3000,
    alreadyPresent: 0,
  });
  const duplicateResult = (
    await store.addCastVoteRecordFile({ electionId, filePath: cvrFile })
  ).unsafeUnwrap();
  expect(duplicateResult).toEqual({
    id: originalResult.id,
    wasExistingFile: true,
    newlyAdded: 0,
    alreadyPresent: 3000,
  });
});

test('partially duplicate CVR files', async () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const partial1CvrFile =
    electionMinimalExhaustiveSampleFixtures.partial1CvrFile.asFilePath();
  const partial2CvrFile =
    electionMinimalExhaustiveSampleFixtures.partial2CvrFile.asFilePath();
  const addPartial1Result = (
    await store.addCastVoteRecordFile({ electionId, filePath: partial1CvrFile })
  ).unsafeUnwrap();
  expect(addPartial1Result).toEqual({
    id: expect.stringMatching(/^[-0-9a-f]+$/),
    wasExistingFile: false,
    newlyAdded: 101,
    alreadyPresent: 0,
  });
  const addPartial2Result = (
    await store.addCastVoteRecordFile({ electionId, filePath: partial2CvrFile })
  ).unsafeUnwrap();
  expect(addPartial2Result).toEqual({
    id: expect.stringMatching(/^[-0-9a-f]+$/),
    wasExistingFile: false,
    newlyAdded: 20,
    alreadyPresent: 21,
  });

  const partial1WriteInCount = 42;
  const partial2WriteInCount = 17;
  const duplicatedWriteInCount = 6;

  expect(store.getWriteInRecords({ electionId })).toHaveLength(
    partial1WriteInCount + partial2WriteInCount - duplicatedWriteInCount
  );
});

test('analyze a CVR file', async () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const cvrFile =
    electionMinimalExhaustiveSampleFixtures.standardCvrFile.asFilePath();
  expect(
    (
      await store.addCastVoteRecordFile({
        electionId,
        filePath: cvrFile,
        analyzeOnly: true,
      })
    ).unsafeUnwrap()
  ).toEqual({
    id: expect.any(String),
    wasExistingFile: false,
    newlyAdded: 3000,
    alreadyPresent: 0,
  });

  // analyzing does not add to the store
  expect(store.getCastVoteRecordEntries(electionId)).toHaveLength(0);
});

test('add a CVR file entry without a ballot ID', async () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const { cvrData } = electionMinimalExhaustiveSampleFixtures;
  const tmpfile = fileSync();
  await fs.writeFile(
    tmpfile.name,
    cvrData.replaceAll('_ballotId', '_notBallotId')
  );

  const result = await store.addCastVoteRecordFile({
    electionId,
    originalFilename: 'cvrs.jsonl',
    filePath: tmpfile.name,
  });

  expect(result.isErr()).toBe(true);
  expect(result.unsafeUnwrapErr()).toEqual(
    typedAs<AddCastVoteRecordError>({ kind: 'BallotIdRequired' })
  );
});

test('add a CVR file entry matching an existing ballot ID with different data', async () => {
  const { electionDefinition, standardCvrFile } =
    electionMinimalExhaustiveSampleFixtures;

  const store = Store.memoryStore();
  const electionId = store.addElection(electionDefinition.electionData);

  await store.addCastVoteRecordFile({
    electionId,
    filePath: standardCvrFile.asFilePath(),
  });

  // Create modified CVR file with ballot data changed slightly:
  const tmpFile = fileSync();
  await fs.writeFile(
    tmpFile.name,
    standardCvrFile.asText().replaceAll('zebra', 'striped horse')
  );

  const result = await store.addCastVoteRecordFile({
    electionId,
    filePath: tmpFile.name,
  });

  expect(result.isErr()).toBe(true);
  expect(result.err()).toMatchObject({
    kind: 'BallotIdAlreadyExistsWithDifferentData',
    existingData: /zebra/,
    newData: /striped horse/,
  });
});

test('add a live CVR file after adding a test CVR file', async () => {
  const { electionDefinition, standardCvrFile, standardLiveCvrFile } =
    electionMinimalExhaustiveSampleFixtures;

  const store = Store.memoryStore();
  const electionId = store.addElection(electionDefinition.electionData);

  await store.addCastVoteRecordFile({
    electionId,
    filePath: standardCvrFile.asFilePath(),
    originalFilename: 'test-cvrs.jsonl',
  });

  const result = await store.addCastVoteRecordFile({
    electionId,
    filePath: standardLiveCvrFile.asFilePath(),
    originalFilename: 'live-cvrs.jsonl',
  });

  expect(result.isErr()).toBe(true);
  expect(result.err()).toEqual({
    kind: 'MixedLiveAndTestBallots',
    userFriendlyMessage:
      'this file contains live ballots, but you are currently in test mode',
  });
});

test('add a test CVR file after adding a live CVR file', async () => {
  const { electionDefinition, standardCvrFile, standardLiveCvrFile } =
    electionMinimalExhaustiveSampleFixtures;

  const store = Store.memoryStore();
  const electionId = store.addElection(electionDefinition.electionData);

  await store.addCastVoteRecordFile({
    electionId,
    filePath: standardLiveCvrFile.asFilePath(),
    originalFilename: 'live-cvrs.jsonl',
  });

  const result = await store.addCastVoteRecordFile({
    electionId,
    filePath: standardCvrFile.asFilePath(),
    originalFilename: 'test-cvrs.jsonl',
  });

  expect(result.isErr()).toBe(true);
  expect(result.err()).toEqual({
    kind: 'MixedLiveAndTestBallots',
    userFriendlyMessage:
      'this file contains test ballots, but you are currently in live mode',
  });
});

test('add a CVR file with mixed live and test CVRs', async () => {
  const { electionDefinition, standardCvrFile } =
    electionMinimalExhaustiveSampleFixtures;

  const store = Store.memoryStore();
  const electionId = store.addElection(electionDefinition.electionData);

  // Create modified "test" CVR file with one CVR flipped to "live":
  const cvrData = standardCvrFile.asText();
  const tmpFile = fileSync();
  await fs.writeFile(
    tmpFile.name,
    cvrData.replace('"_testBallot":true', '"_testBallot":false')
  );

  const result = await store.addCastVoteRecordFile({
    electionId,
    filePath: tmpFile.name,
    originalFilename: 'mixed-cvrs.jsonl',
  });

  expect(result.isErr()).toBe(true);
  expect(result.err()).toEqual({
    kind: 'MixedLiveAndTestBallots',
    userFriendlyMessage:
      'these CVRs cannot be tabulated together because ' +
      'they mix live and test ballots',
  });
});

test('get CVR file metadata', async () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const cvrFile =
    electionMinimalExhaustiveSampleFixtures.standardCvrFile.asFilePath();

  expect(
    store.getCastVoteRecordFileMetadata('not a CVR file ID')
  ).toBeUndefined();

  const { id } = (
    await store.addCastVoteRecordFile({
      electionId,
      originalFilename: 'cvrs.jsonl',
      filePath: cvrFile,
    })
  ).unsafeUnwrap();

  const cvrFileMetadata = store.getCastVoteRecordFileMetadata(id);
  expect(cvrFileMetadata).toEqual(
    typedAs<Admin.CastVoteRecordFileRecord>({
      id,
      electionId,
      filename: 'cvrs.jsonl',
      sha256Hash: expect.any(String),
      createdAt: expect.any(String),
    })
  );
});

test('getCvrFileMode returns "unlocked" if no CVRs exist', () => {
  const store = Store.memoryStore();
  expect(store.getCurrentCvrFileModeForElection('unknown-election-id')).toBe(
    Admin.CvrFileMode.Unlocked
  );

  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  expect(store.getCurrentCvrFileModeForElection(electionId)).toBe(
    Admin.CvrFileMode.Unlocked
  );
});

test('getCvrFileMode returns "test" if test CVRs previously imported', async () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  await store.addCastVoteRecordFile({
    electionId,
    filePath:
      electionMinimalExhaustiveSampleFixtures.standardCvrFile.asFilePath(),
    originalFilename: 'cvrs.jsonl',
  });

  expect(store.getCurrentCvrFileModeForElection(electionId)).toBe(
    Admin.CvrFileMode.Test
  );
});

test('getCvrFileMode returns "live" if official CVRs previously imported', async () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  await store.addCastVoteRecordFile({
    electionId,
    filePath:
      electionMinimalExhaustiveSampleFixtures.standardLiveCvrFile.asFilePath(),
    originalFilename: 'cvrs.jsonl',
  });

  expect(store.getCurrentCvrFileModeForElection(electionId)).toBe(
    Admin.CvrFileMode.Official
  );
});

test('get write-in adjudication records', async () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const { cvrData } = electionMinimalExhaustiveSampleFixtures;
  const tmpfile = fileSync();
  await fs.writeFile(
    tmpfile.name,
    cvrData.slice(0, cvrData.indexOf('\n', cvrData.indexOf('\n') + 1) + 1)
  );

  (
    await store.addCastVoteRecordFile({
      electionId,
      originalFilename: 'cvrs.jsonl',
      // add the first two CVRs, which do not have write-ins
      filePath: tmpfile.name,
    })
  ).unsafeUnwrap();

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
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const { cvrData } = electionMinimalExhaustiveSampleFixtures;
  const tmpfile = fileSync();

  // add the first two CVRs, which do not have write-ins
  await fs.writeFile(
    tmpfile.name,
    cvrData.slice(0, cvrData.indexOf('\n', cvrData.indexOf('\n') + 1) + 1)
  );

  (
    await store.addCastVoteRecordFile({
      electionId,
      originalFilename: 'cvrs.jsonl',
      filePath: tmpfile.name,
    })
  ).unsafeUnwrap();

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
        locales: arbitraryBallotLocale(),
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
