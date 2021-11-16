import { electionSample } from '@votingworks/fixtures';
import { fakeKiosk, zipFile } from '@votingworks/test-utils';
import { PrecinctIdSchema, unsafeParse } from '@votingworks/types';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ballotPackageUtils, BallotPackageManifest } from './ballot_package';

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
  } = await ballotPackageUtils.readBallotPackageFromFile(file);
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
  } = await ballotPackageUtils.readBallotPackageFromFilePointer({
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

test('readBallotPackageFromFile throws when an election.json is not present', async () => {
  const pkg = await zipFile({});
  await expect(
    ballotPackageUtils.readBallotPackageFromFile(
      new File([pkg], 'election-ballot-package.zip')
    )
  ).rejects.toThrowError(
    "ballot package does not have a file called 'election.json': election-ballot-package.zip"
  );
});

test('readBallotPackageFromFile throws when an manifest.json is not present', async () => {
  const pkg = await zipFile({
    'election.json': JSON.stringify(electionSample),
  });
  await expect(
    ballotPackageUtils.readBallotPackageFromFile(
      new File([pkg], 'election-ballot-package.zip')
    )
  ).rejects.toThrowError(
    "ballot package does not have a file called 'manifest.json': election-ballot-package.zip"
  );
});

test('readBallotPackageFromFile throws when the manifest does not match ballots', async () => {
  const manifest: BallotPackageManifest = {
    ballots: [
      {
        ballotStyleId: '5',
        precinctId: unsafeParse(PrecinctIdSchema, '21'),
        filename: 'test/election-deadbeef-whatever.pdf',
        contestIds: ['1', '2'],
        isLiveMode: false,
        locales: { primary: 'en-US' },
      },
    ],
  };
  const pkg = await zipFile({
    'election.json': JSON.stringify(electionSample),
    'manifest.json': JSON.stringify(manifest),
  });

  await expect(
    ballotPackageUtils.readBallotPackageFromFile(
      new File([pkg], 'election-ballot-package.zip')
    )
  ).rejects.toThrowError(
    "ballot package is malformed; found 0 file(s) matching entries in the manifest ('manifest.json'), but the manifest has 1. perhaps this ballot package is using a different version of the software?"
  );
});

test('readBallotPackageFromFile throws when given an invalid zip file', async () => {
  await expect(
    ballotPackageUtils.readBallotPackageFromFile(
      new File(['not-a-zip'], 'election-ballot-package.zip')
    )
  ).rejects.toThrowError();
});

test('readBallotPackageFromFilePointer throws when given an invalid zip file', async () => {
  const mockKiosk = fakeKiosk();
  mockKiosk.readFile = jest.fn().mockResolvedValue(Buffer.of(0, 1, 2));
  window.kiosk = mockKiosk;

  await expect(
    ballotPackageUtils.readBallotPackageFromFilePointer({
      name: 'file-name',
      path: 'path',
      size: 0,
    } as unknown as KioskBrowser.FileSystemEntry)
  ).rejects.toThrowError();
});

test('readBallotPackageFromFile throws when the file cannot be read', async () => {
  await expect(
    ballotPackageUtils.readBallotPackageFromFile({} as unknown as File)
  ).rejects.toThrowError();
});

test('readBallotPackageFromFilePointer throws when the file cannot be read', async () => {
  await expect(
    ballotPackageUtils.readBallotPackageFromFilePointer(
      {} as unknown as KioskBrowser.FileSystemEntry
    )
  ).rejects.toThrowError();
});
