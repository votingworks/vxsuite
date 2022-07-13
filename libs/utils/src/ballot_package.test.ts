import { electionSample } from '@votingworks/fixtures';
import { fakeKiosk, zipFile } from '@votingworks/test-utils';
import { BallotPageLayout, BallotType } from '@votingworks/types';
import { Buffer } from 'buffer';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
  BallotPackageEntry,
  BallotPackageManifest,
  readBallotPackageFromBuffer,
  readBallotPackageFromFile,
  readBallotPackageFromFilePointer,
} from './ballot_package';
import { typedAs } from './types';

test('readBallotPackageFromFile finds all expected ballots', async () => {
  const file = new File(
    [
      await fs.readFile(
        join(__dirname, 'data/ballot-package-state-of-hamilton.zip')
      ),
    ],
    'ballot-package-state-of-hamilton.zip'
  );
  const {
    ballots,
    electionDefinition: { election },
  } = await readBallotPackageFromFile(file);
  const ballotStyleIds = election.ballotStyles.map(({ id }) => id);
  const precinctIds = election.precincts.map(({ id }) => id);
  expect(election.title).toEqual('General Election');
  expect(election.state).toEqual('State of Hamilton');
  expect(ballots.length).toEqual(16);

  for (const { ballotConfig, pdf } of ballots) {
    expect(ballotStyleIds).toContain(ballotConfig.ballotStyleId);
    expect(precinctIds).toContain(ballotConfig.precinctId);
    expect(pdf).toBeInstanceOf(Buffer);
  }
});

test('readBallotPackageFromBuffer finds all expected ballots', async () => {
  const buffer = await fs.readFile(
    join(__dirname, 'data/ballot-package-state-of-hamilton.zip')
  );
  const {
    ballots,
    electionDefinition: { election },
  } = await readBallotPackageFromBuffer(buffer);
  const ballotStyleIds = election.ballotStyles.map(({ id }) => id);
  const precinctIds = election.precincts.map(({ id }) => id);
  expect(election.title).toEqual('General Election');
  expect(election.state).toEqual('State of Hamilton');
  expect(ballots.length).toEqual(16);

  for (const { ballotConfig, pdf } of ballots) {
    expect(ballotStyleIds).toContain(ballotConfig.ballotStyleId);
    expect(precinctIds).toContain(ballotConfig.precinctId);
    expect(pdf).toBeInstanceOf(Buffer);
  }
});

test('readBallotPackageFromFilePointer finds all expected ballots', async () => {
  const pathToFile = join(
    __dirname,
    'data/ballot-package-state-of-hamilton.zip'
  );
  const fileName = 'ballot-package-state-of-hamilton.zip';

  const mockKiosk = fakeKiosk();
  mockKiosk.readFile = jest
    .fn()
    .mockResolvedValue(await fs.readFile(pathToFile));
  window.kiosk = mockKiosk;

  const {
    ballots,
    electionDefinition: { election },
  } = await readBallotPackageFromFilePointer({
    name: fileName,
    path: pathToFile,
    size: 0,
  } as unknown as KioskBrowser.FileSystemEntry);
  const ballotStyleIds = election.ballotStyles.map(({ id }) => id);
  const precinctIds = election.precincts.map(({ id }) => id);
  expect(election.title).toEqual('General Election');
  expect(election.state).toEqual('State of Hamilton');
  expect(ballots.length).toEqual(16);

  for (const { ballotConfig, pdf } of ballots) {
    expect(ballotStyleIds).toContain(ballotConfig.ballotStyleId);
    expect(precinctIds).toContain(ballotConfig.precinctId);
    expect(pdf).toBeInstanceOf(Buffer);
  }
});

test('readBallotPackageFromFilePointer finds all expected ballots with layouts', async () => {
  const manifest: BallotPackageManifest = {
    ballots: [
      {
        ballotStyleId: '5',
        precinctId: '21',
        filename: 'election-deadbeef-whatever.pdf',
        layoutFilename: 'election-deadbeef-whatever-layout.json',
        contestIds: ['1', '2'],
        isLiveMode: false,
        isAbsentee: false,
        locales: { primary: 'en-US' },
      },
    ],
  };
  const layouts: BallotPageLayout[] = [
    {
      contests: [],
      metadata: {
        ballotStyleId: '5',
        precinctId: '21',
        isTestMode: true,
        ballotType: BallotType.Standard,
        electionHash: 'deadbeef',
        locales: { primary: 'en-US' },
        pageNumber: 1,
      },
      pageSize: { width: 1224, height: 1584 },
    },
  ];

  const pkg = await zipFile({
    'election.json': JSON.stringify(electionSample),
    'manifest.json': JSON.stringify(manifest),
    'election-deadbeef-whatever.pdf': Buffer.from('%PDF'),
    'election-deadbeef-whatever-layout.json': JSON.stringify(layouts),
  });

  expect(
    (
      await readBallotPackageFromFile(
        new File([pkg], 'election-ballot-package.zip')
      )
    ).ballots
  ).toEqual([
    expect.objectContaining(
      typedAs<Partial<BallotPackageEntry>>({
        layout: layouts,
      })
    ),
  ]);
});

test('readBallotPackageFromFile throws when an election.json is not present', async () => {
  const pkg = await zipFile({});
  await expect(
    readBallotPackageFromFile(new File([pkg], 'election-ballot-package.zip'))
  ).rejects.toThrowError(
    "ballot package does not have a file called 'election.json'"
  );
});

test('readBallotPackageFromFile throws when an manifest.json is not present', async () => {
  const pkg = await zipFile({
    'election.json': JSON.stringify(electionSample),
  });
  await expect(
    readBallotPackageFromFile(new File([pkg], 'election-ballot-package.zip'))
  ).rejects.toThrowError(
    "ballot package does not have a file called 'manifest.json'"
  );
});

test('readBallotPackageFromFile throws when the manifest does not match ballots', async () => {
  const manifest: BallotPackageManifest = {
    ballots: [
      {
        ballotStyleId: '5',
        precinctId: '21',
        filename: 'test/election-deadbeef-whatever.pdf',
        layoutFilename: 'test/election-deadbeef-whatever-layout.json',
        contestIds: ['1', '2'],
        isLiveMode: false,
        isAbsentee: false,
        locales: { primary: 'en-US' },
      },
    ],
  };
  const pkg = await zipFile({
    'election.json': JSON.stringify(electionSample),
    'manifest.json': JSON.stringify(manifest),
  });

  await expect(
    readBallotPackageFromFile(new File([pkg], 'election-ballot-package.zip'))
  ).rejects.toThrowError(
    "ballot package does not have a file called 'test/election-deadbeef-whatever.pdf'"
  );
});

test('readBallotPackageFromFile throws when given an invalid zip file', async () => {
  await expect(
    readBallotPackageFromFile(
      new File(['not-a-zip'], 'election-ballot-package.zip')
    )
  ).rejects.toThrowError();
});

test('readBallotPackageFromFilePointer throws when given an invalid zip file', async () => {
  const mockKiosk = fakeKiosk();
  mockKiosk.readFile = jest.fn().mockResolvedValue(Buffer.of(0, 1, 2));
  window.kiosk = mockKiosk;

  await expect(
    readBallotPackageFromFilePointer({
      name: 'file-name',
      path: 'path',
      size: 0,
    } as unknown as KioskBrowser.FileSystemEntry)
  ).rejects.toThrowError();
});

test('readBallotPackageFromFile throws when the file cannot be read', async () => {
  await expect(
    readBallotPackageFromFile({} as unknown as File)
  ).rejects.toThrowError();
});

test('readBallotPackageFromFilePointer throws when the file cannot be read', async () => {
  await expect(
    readBallotPackageFromFilePointer(
      {} as unknown as KioskBrowser.FileSystemEntry
    )
  ).rejects.toThrowError();
});
