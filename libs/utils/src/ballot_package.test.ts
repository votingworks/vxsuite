import { zipFile } from '@votingworks/test-utils';
import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { typedAs } from '@votingworks/basics';
import {
  BallotPackage,
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
} from '@votingworks/types';
import { readBallotPackageFromFile } from './ballot_package';

test('readBallotPackageFromFile reads a ballot package without system settings from a file', async () => {
  const pkg = await zipFile({
    'election.json':
      electionGridLayoutNewHampshireAmherstFixtures.electionDefinition
        .electionData,
  });
  expect(
    await readBallotPackageFromFile(
      new File([pkg], 'election-ballot-package.zip')
    )
  ).toEqual(
    typedAs<BallotPackage>({
      electionDefinition:
        electionGridLayoutNewHampshireAmherstFixtures.electionDefinition,
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
    })
  );
});

test('readBallotPackageFromFile reads a ballot package with system settings from a file', async () => {
  const pkg = await zipFile({
    'election.json':
      electionGridLayoutNewHampshireAmherstFixtures.electionDefinition
        .electionData,
    'systemSettings.json': JSON.stringify(
      typedAs<SystemSettings>(DEFAULT_SYSTEM_SETTINGS)
    ),
  });
  expect(
    await readBallotPackageFromFile(
      new File([pkg], 'election-ballot-package.zip')
    )
  ).toEqual(
    typedAs<BallotPackage>({
      electionDefinition:
        electionGridLayoutNewHampshireAmherstFixtures.electionDefinition,
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
    })
  );
});

test('readBallotPackageFromFile throws when an election.json is not present', async () => {
  const pkg = await zipFile({});
  await expect(
    readBallotPackageFromFile(new File([pkg], 'election-ballot-package.zip'))
  ).rejects.toThrowError(
    "ballot package does not have a file called 'election.json'"
  );
});

test('readBallotPackageFromFile throws when given an invalid zip file', async () => {
  await expect(
    readBallotPackageFromFile(
      new File(['not-a-zip'], 'election-ballot-package.zip')
    )
  ).rejects.toThrowError();
});

test('readBallotPackageFromFile throws when the file cannot be read', async () => {
  await expect(
    readBallotPackageFromFile({} as unknown as File)
  ).rejects.toThrowError();
});
