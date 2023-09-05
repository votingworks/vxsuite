import {
  asElectionDefinition,
  electionGridLayoutNewHampshireAmherstFixtures,
} from '@votingworks/fixtures';
import { mockOf } from '@votingworks/test-utils';
import {
  BallotIdSchema,
  BallotType,
  CVR,
  DEFAULT_SYSTEM_SETTINGS,
  safeParseJson,
  TEST_JURISDICTION,
  unsafeParse,
} from '@votingworks/types';
import Database from 'better-sqlite3';
import { createWriteStream, readFileSync, writeFileSync } from 'fs';
import { writeFile, existsSync } from 'fs-extra';
import { basename } from 'path';
import { fileSync, tmpNameSync } from 'tmp';
import ZipStream from 'zip-stream';
import {
  CAST_VOTE_RECORD_REPORT_FILENAME,
  getEntries,
  openZip,
  readEntry,
  readJsonEntry,
  readTextEntry,
} from '@votingworks/utils';
import { backup, Backup } from './backup';
import { Store } from './store';

const { election, electionDefinition } =
  electionGridLayoutNewHampshireAmherstFixtures;

jest.mock('fs-extra', (): typeof import('fs-extra') => {
  return {
    ...jest.requireActual('fs-extra'),
    existsSync: jest.fn((path) =>
      jest.requireActual('fs-extra').existsSync(path)
    ),
    createReadStream: (path) => {
      if (path === '/var/log/vx-logs.log') {
        const tmpFile = tmpNameSync();
        writeFileSync(tmpFile, 'mock logs');
        return jest.requireActual('fs-extra').createReadStream(tmpFile);
      }
      return jest.requireActual('fs-extra').createReadStream(path);
    },
  };
});

const existsSyncMock = mockOf(existsSync);

const jurisdiction = TEST_JURISDICTION;

// Note that in all of these tests, we write to an tmp output file rather than
// using an in-memory stream to avoid buffer overflows, which cause zipstream to
// hang indefinitely.
function tmpOutputFile() {
  const outputFile = tmpNameSync();
  const outputStream = createWriteStream(outputFile);
  return { outputFile, outputStream };
}

test('unconfigured', async () => {
  const store = Store.memoryStore();

  await expect(
    new Promise((resolve, reject) => {
      backup(store).on('error', reject).on('close', resolve);
    })
  ).rejects.toThrowError('cannot backup without election configuration');
});

test('configured', async () => {
  const store = Store.memoryStore();
  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction,
  });
  store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
  const { outputStream } = tmpOutputFile();
  const onError = jest.fn();

  await new Promise((resolve) => {
    backup(store).on('error', onError).pipe(outputStream).on('finish', resolve);
  });

  expect(onError).not.toHaveBeenCalled();
});

test('zip entry fails', async () => {
  const store = Store.memoryStore();
  const zip = new ZipStream();
  const b = new Backup(zip, store);

  jest
    .spyOn(zip, 'entry')
    .mockImplementationOnce((_data, _opts, callback): ZipStream => {
      callback(new Error('oh no'));
      return zip;
    });

  await expect(b.addEntry('readme.txt', 'look it up')).rejects.toThrowError(
    'oh no'
  );
});

test('has election.json', async () => {
  const store = Store.memoryStore();
  store.setElectionAndJurisdiction({
    electionData: asElectionDefinition(election).electionData,
    jurisdiction,
  });
  store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
  const { outputFile, outputStream } = tmpOutputFile();

  await new Promise((resolve, reject) => {
    backup(store).on('error', reject).pipe(outputStream).on('finish', resolve);
  });

  const zipfile = await openZip(readFileSync(outputFile));
  const entries = getEntries(zipfile);
  const electionEntry = entries.find(({ name }) => name === 'election.json')!;
  expect(await readJsonEntry(electionEntry)).toEqual(election);
});

test('has ballots.db', async () => {
  const store = Store.memoryStore();
  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction,
  });
  store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
  const { outputFile, outputStream } = tmpOutputFile();

  await new Promise((resolve, reject) => {
    backup(store).on('error', reject).pipe(outputStream).on('finish', resolve);
  });

  const zipfile = await openZip(readFileSync(outputFile));
  const entries = getEntries(zipfile);
  expect(entries.map((entry) => entry.name)).toContain('ballots.db');

  const dbEntry = entries.find((entry) => entry.name === 'ballots.db');
  const dbFile = fileSync();
  await writeFile(dbFile.fd, await readEntry(dbEntry!));
  const db = new Database(dbFile.name);
  const stmt = db.prepare('select election_data as electionData from election');
  const row: { electionData: string } = stmt.get();
  expect(row.electionData).toEqual(electionDefinition.electionData);
});

test('has all files referenced in the database', async () => {
  const store = Store.memoryStore();
  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction,
  });
  store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
  const batchId = store.addBatch();

  const frontImagePath = fileSync();
  await writeFile(frontImagePath.fd, 'front image path');

  const backImagePath = fileSync();
  await writeFile(backImagePath.fd, 'back image path');

  store.addSheet('sheet-1', batchId, [
    {
      interpretation: { type: 'UnreadablePage' },
      imagePath: frontImagePath.name,
    },
    {
      interpretation: { type: 'UnreadablePage' },
      imagePath: backImagePath.name,
    },
  ]);

  const { outputFile, outputStream } = tmpOutputFile();

  await new Promise((resolve, reject) => {
    backup(store).on('error', reject).pipe(outputStream).on('finish', resolve);
  });

  const zipfile = await openZip(readFileSync(outputFile));
  const entries = getEntries(zipfile);

  expect(
    entries
      .map((entry) => entry.name)
      .filter(
        (fileName) =>
          fileName !== 'election.json' &&
          fileName !== 'ballots.db' &&
          fileName !== 'ballots.db.digest' &&
          fileName !== CAST_VOTE_RECORD_REPORT_FILENAME
      )
      .sort()
  ).toEqual(
    [frontImagePath.name, backImagePath.name]
      .map((name) => basename(name))
      .sort()
  );

  for (const [{ name }, content] of [
    [frontImagePath, 'front image path'],
    [backImagePath, 'back image path'],
  ] as const) {
    expect(
      new TextDecoder().decode(
        await readEntry(entries.find((entry) => entry.name === basename(name))!)
      )
    ).toEqual(content);
  }

  const dbEntry = entries.find((entry) => entry.name === 'ballots.db');
  const dbFile = fileSync();
  await writeFile(dbFile.fd, await readEntry(dbEntry!));
  const db = new Database(dbFile.name);
  const stmt = db.prepare<[]>(
    'select front_image_path as filename from sheets'
  );
  const row: { filename: string } = stmt.get();
  expect(row).toEqual({
    filename: basename(frontImagePath.name),
  });
});

test('has cast vote record report', async () => {
  const store = Store.memoryStore();
  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction,
  });
  store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
  const { outputFile, outputStream } = tmpOutputFile();

  const batchId = store.addBatch();
  const imageFile = fileSync();
  await writeFile(imageFile.fd, 'front image path');
  store.addSheet('sheet-1', batchId, [
    {
      interpretation: {
        type: 'InterpretedBmdPage',
        ballotId: unsafeParse(BallotIdSchema, 'abc'),
        metadata: {
          ballotStyleId: 'card-number-3',
          precinctId: 'town-id-00701-precinct-id-',
          ballotType: BallotType.Precinct,
          electionHash: electionDefinition.electionHash,
          isTestMode: false,
        },
        votes: {
          'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc':
            [
              'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc-option-yes',
            ],
        },
      },
      imagePath: imageFile.name,
    },
    {
      interpretation: { type: 'BlankPage' },
      imagePath: imageFile.name,
    },
  ]);

  await new Promise((resolve, reject) => {
    backup(store).on('error', reject).pipe(outputStream).on('finish', resolve);
  });

  const zipfile = await openZip(readFileSync(outputFile));
  const entries = getEntries(zipfile);
  expect(entries.map(({ name }) => name)).toContain(
    CAST_VOTE_RECORD_REPORT_FILENAME
  );

  const cvrsEntry = entries.find(
    ({ name }) => name === CAST_VOTE_RECORD_REPORT_FILENAME
  )!;
  const exportedReport = unsafeParse(
    CVR.CastVoteRecordReportSchema,
    safeParseJson(await readTextEntry(cvrsEntry)).unsafeUnwrap()
  );
  expect(exportedReport.CVR).toHaveLength(1);
  const exportedCvr = exportedReport.CVR![0]!;
  expect(exportedCvr.UniqueId).toEqual('abc');
  expect(exportedCvr.BatchId).toEqual(batchId);
  expect(exportedCvr.BatchSequenceId).toBeUndefined();
});

test('does not have vx-logs.log if file does not exist', async () => {
  existsSyncMock.mockReturnValueOnce(false);

  const store = Store.memoryStore();
  store.setElectionAndJurisdiction({
    electionData: asElectionDefinition(election).electionData,
    jurisdiction,
  });
  store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
  const { outputFile, outputStream } = tmpOutputFile();

  await new Promise((resolve, reject) => {
    backup(store).on('error', reject).pipe(outputStream).on('finish', resolve);
  });

  const zipfile = await openZip(readFileSync(outputFile));
  const entries = getEntries(zipfile);
  expect(!entries.some(({ name }) => name === 'vx-logs.log')).toEqual(true);
});

test('has vx-logs.log if file exists', async () => {
  existsSyncMock.mockReturnValueOnce(true);

  const store = Store.memoryStore();
  store.setElectionAndJurisdiction({
    electionData: asElectionDefinition(election).electionData,
    jurisdiction,
  });
  store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);

  const { outputFile, outputStream } = tmpOutputFile();

  await new Promise((resolve, reject) => {
    backup(store).on('error', reject).pipe(outputStream).on('finish', resolve);
  });

  const zipfile = await openZip(readFileSync(outputFile));
  const entries = getEntries(zipfile);
  const logsEntry = entries.find(({ name }) => name === 'vx-logs.log')!;
  expect(await readTextEntry(logsEntry)).toEqual('mock logs');
});
