import { asElectionDefinition } from '@votingworks/fixtures';
import { mockOf } from '@votingworks/test-utils';
import { BallotIdSchema, BallotType, unsafeParse } from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';
import Database from 'better-sqlite3';
import { Buffer } from 'buffer';
import { writeFileSync } from 'fs';
import { writeFile, existsSync } from 'fs-extra';
import JsZip, { JSZipObject } from 'jszip';
import { WritableStream } from 'memory-streams';
import { basename } from 'path';
import { fileSync, tmpNameSync } from 'tmp';
import ZipStream from 'zip-stream';
import { election, electionDefinition } from '../test/fixtures/2020-choctaw';
import { backup, Backup } from './backup';
import { Store } from './store';

jest.mock('fs-extra', (): typeof import('fs-extra') => {
  return {
    ...jest.requireActual('fs-extra'),
    existsSync: jest.fn((path) =>
      jest.requireActual('fs-extra').existsSync(path)
    ),
    createReadStream: jest.fn((path) => {
      if (path === '/var/log/vx-logs.log') {
        const tmpFile = tmpNameSync();
        writeFileSync(tmpFile, 'mock logs');
        return jest.requireActual('fs-extra').createReadStream(tmpFile);
      }
      return jest.requireActual('fs-extra').createReadStream(path);
    }),
  };
});

const existsSyncMock = mockOf(existsSync);

function getEntries(zipfile: JsZip): JSZipObject[] {
  return Object.values(zipfile.files);
}

async function openZip(data: Buffer): Promise<JsZip> {
  return await new JsZip().loadAsync(data);
}

async function readEntry(entry: JSZipObject): Promise<Buffer> {
  return entry.async('nodebuffer');
}

async function readTextEntry(entry: JSZipObject): Promise<string> {
  const bytes = await readEntry(entry);
  const string = new TextDecoder().decode(bytes);
  return string;
}

async function readJsonEntry(entry: JSZipObject): Promise<unknown> {
  return readTextEntry(entry).then(JSON.parse);
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
  store.setElection(electionDefinition.electionData);
  const result = new WritableStream();
  const onError = jest.fn();

  await new Promise((resolve) => {
    backup(store).on('error', onError).pipe(result).on('finish', resolve);
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
  store.setElection(asElectionDefinition(election).electionData);
  const result = new WritableStream();

  await new Promise((resolve, reject) => {
    backup(store).on('error', reject).pipe(result).on('finish', resolve);
  });

  const zipfile = await openZip(result.toBuffer());
  const entries = getEntries(zipfile);
  const electionEntry = entries.find(({ name }) => name === 'election.json')!;
  expect(await readJsonEntry(electionEntry)).toEqual(election);
});

test('has ballots.db', async () => {
  const store = Store.memoryStore();
  store.setElection(electionDefinition.electionData);
  const output = new WritableStream();

  await new Promise((resolve, reject) => {
    backup(store).on('error', reject).pipe(output).on('finish', resolve);
  });

  const zipfile = await openZip(output.toBuffer());
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
  store.setElection(electionDefinition.electionData);
  const batchId = store.addBatch();

  const frontOriginalFile = fileSync();
  await writeFile(frontOriginalFile.fd, 'front original');

  const frontNormalizedFile = fileSync();
  await writeFile(frontNormalizedFile.fd, 'front normalized');

  const backOriginalFile = fileSync();
  await writeFile(backOriginalFile.fd, 'back original');

  store.addSheet('sheet-1', batchId, [
    {
      interpretation: { type: 'UnreadablePage' },
      originalFilename: frontOriginalFile.name,
      normalizedFilename: frontNormalizedFile.name,
    },
    {
      interpretation: { type: 'UnreadablePage' },
      // intentionally the same, for cases where that's true
      originalFilename: backOriginalFile.name,
      normalizedFilename: backOriginalFile.name,
    },
  ]);

  const output = new WritableStream();

  await new Promise((resolve, reject) => {
    backup(store).on('error', reject).pipe(output).on('finish', resolve);
  });

  const zipfile = await openZip(output.toBuffer());
  const entries = getEntries(zipfile);

  expect(
    entries
      .map((entry) => entry.name)
      .filter(
        (fileName) =>
          fileName !== 'election.json' &&
          fileName !== 'ballots.db' &&
          fileName !== 'ballots.db.digest' &&
          fileName !== 'cvrs.jsonl'
      )
      .sort()
  ).toEqual(
    [frontOriginalFile.name, frontNormalizedFile.name, backOriginalFile.name]
      .map((name) => basename(name))
      .sort()
  );

  for (const [{ name }, content] of [
    [frontOriginalFile, 'front original'],
    [frontNormalizedFile, 'front normalized'],
    [backOriginalFile, 'back original'],
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
    'select front_original_filename as filename from sheets'
  );
  const row: { filename: string } = stmt.get();
  expect(row).toEqual({
    filename: basename(frontOriginalFile.name),
  });
});

test('has cvrs.jsonl', async () => {
  const store = Store.memoryStore();
  store.setElection(electionDefinition.electionData);
  const result = new WritableStream();

  const batchId = store.addBatch();
  const imageFile = fileSync();
  await writeFile(imageFile.fd, 'front original');
  store.addSheet('sheet-1', batchId, [
    {
      interpretation: {
        type: 'InterpretedBmdPage',
        ballotId: unsafeParse(BallotIdSchema, 'abc'),
        metadata: {
          ballotStyleId: '1',
          precinctId: '6522',
          ballotType: BallotType.Standard,
          electionHash: electionDefinition.electionHash,
          isTestMode: false,
          locales: { primary: 'en-US' },
        },
        votes: {
          'flag-question': ['yes'],
        },
      },
      originalFilename: imageFile.name,
      normalizedFilename: imageFile.name,
    },
    {
      interpretation: { type: 'BlankPage' },
      originalFilename: imageFile.name,
      normalizedFilename: imageFile.name,
    },
  ]);

  await new Promise((resolve, reject) => {
    backup(store).on('error', reject).pipe(result).on('finish', resolve);
  });

  const zipfile = await openZip(result.toBuffer());
  const entries = getEntries(zipfile);
  expect(entries.map(({ name }) => name)).toContain('cvrs.jsonl');

  const cvrsEntry = entries.find(({ name }) => name === 'cvrs.jsonl')!;
  expect(await readTextEntry(cvrsEntry)).toEqual(
    `{"1":[],"2":[],"3":[],"4":[],"_ballotId":"abc","_ballotStyleId":"1","_ballotType":"standard","_batchId":"${batchId}","_batchLabel":"Batch 1","_precinctId":"6522","_scannerId":"000","_testBallot":false,"initiative-65":[],"initiative-65-a":[],"flag-question":["yes"],"runoffs-question":[]}\n`
  );
});

test('does not have vx-logs.log if file does not exist', async () => {
  existsSyncMock.mockReturnValueOnce(false);

  const store = Store.memoryStore();
  store.setElection(asElectionDefinition(election).electionData);
  const result = new WritableStream();

  await new Promise((resolve, reject) => {
    backup(store).on('error', reject).pipe(result).on('finish', resolve);
  });

  const zipfile = await openZip(result.toBuffer());
  const entries = getEntries(zipfile);
  expect(!entries.some(({ name }) => name === 'vx-logs.log')).toEqual(true);
});

test('has vx-logs.log if file exists', async () => {
  existsSyncMock.mockReturnValueOnce(true);

  const store = Store.memoryStore();
  store.setElection(asElectionDefinition(election).electionData);
  const result = new WritableStream();

  await new Promise((resolve, reject) => {
    backup(store).on('error', reject).pipe(result).on('finish', resolve);
  });

  const zipfile = await openZip(result.toBuffer());
  const entries = getEntries(zipfile);
  const logsEntry = entries.find(({ name }) => name === 'vx-logs.log')!;
  expect(await readTextEntry(logsEntry)).toEqual('mock logs');
});

const spaceOptimizedBackupTestCases: Array<{
  saveOnlyOriginalImagesThenOnlyNormalizedImagesAfterNumSheets?: number;
  numSheets: number;
  expectedScanImagesInBackup: 'All' | 'OriginalOnly' | 'NormalizedOnly';
}> = [
  {
    saveOnlyOriginalImagesThenOnlyNormalizedImagesAfterNumSheets: undefined,
    numSheets: 1,
    expectedScanImagesInBackup: 'All',
  },
  {
    saveOnlyOriginalImagesThenOnlyNormalizedImagesAfterNumSheets: 1,
    numSheets: 1,
    expectedScanImagesInBackup: 'OriginalOnly',
  },
  {
    saveOnlyOriginalImagesThenOnlyNormalizedImagesAfterNumSheets: 1,
    numSheets: 2,
    expectedScanImagesInBackup: 'NormalizedOnly',
  },
];

test.each(spaceOptimizedBackupTestCases)(
  'saveOnlyOriginalImagesThenOnlyNormalizedImagesAfterNumSheets affects what is backed up as expected (%s)',
  async ({
    saveOnlyOriginalImagesThenOnlyNormalizedImagesAfterNumSheets,
    numSheets,
    expectedScanImagesInBackup,
  }) => {
    const store = Store.memoryStore();
    store.setElection(electionDefinition.electionData);
    const batchId = store.addBatch();

    const originalFileNames = [];
    const normalizedFileNames = [];
    for (let i = 0; i < numSheets; i += 1) {
      const frontOriginalFile = fileSync();
      await writeFile(frontOriginalFile.fd, 'front-original');
      const frontNormalizedFile = fileSync();
      await writeFile(frontNormalizedFile.fd, 'front-normalized');
      const backOriginalFile = fileSync();
      await writeFile(backOriginalFile.fd, 'back-original');
      const backNormalizedFile = fileSync();
      await writeFile(backNormalizedFile.fd, 'back-normalized');
      originalFileNames.push(frontOriginalFile.name, backOriginalFile.name);
      normalizedFileNames.push(
        frontNormalizedFile.name,
        backNormalizedFile.name
      );
      store.addSheet(`sheet-${i + 1}`, batchId, [
        {
          interpretation: { type: 'UnreadablePage' },
          originalFilename: frontOriginalFile.name,
          normalizedFilename: frontNormalizedFile.name,
        },
        {
          interpretation: { type: 'UnreadablePage' },
          originalFilename: backOriginalFile.name,
          normalizedFilename: backNormalizedFile.name,
        },
      ]);
    }

    const output = new WritableStream();
    await new Promise((resolve, reject) => {
      backup(store, {
        saveOnlyOriginalImagesThenOnlyNormalizedImagesAfterNumSheets,
      })
        .on('error', reject)
        .pipe(output)
        .on('finish', resolve);
    });
    const zipfile = await openZip(output.toBuffer());
    const entries = getEntries(zipfile);

    let expectedScanImageFileNamesInBackup: string[] = [];
    if (expectedScanImagesInBackup === 'All') {
      expectedScanImageFileNamesInBackup = [
        ...originalFileNames,
        ...normalizedFileNames,
      ];
    } else if (expectedScanImagesInBackup === 'NormalizedOnly') {
      expectedScanImageFileNamesInBackup = normalizedFileNames;
    } else if (expectedScanImagesInBackup === 'OriginalOnly') {
      expectedScanImageFileNamesInBackup = originalFileNames;
    } else {
      throwIllegalValue(expectedScanImagesInBackup);
    }
    expect(
      entries
        .map((entry) => entry.name)
        .filter(
          (fileName) =>
            fileName !== 'election.json' &&
            fileName !== 'ballots.db' &&
            fileName !== 'ballots.db.digest' &&
            fileName !== 'cvrs.jsonl'
        )
        .sort()
    ).toEqual(
      expectedScanImageFileNamesInBackup.map((name) => basename(name)).sort()
    );
  }
);
