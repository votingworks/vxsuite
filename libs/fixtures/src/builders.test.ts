import { afterEach, beforeEach, expect, test } from 'vitest';
import { basename, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import * as builders from './builders';
import { clearTemporaryRootDir, setupTemporaryRootDir } from './tmpdir';

beforeEach(setupTemporaryRootDir);
afterEach(clearTemporaryRootDir);

test('file allows reading the file contents', () => {
  const file = builders.file('package.json');
  expect(JSON.parse(file.asText()).name).toEqual('@votingworks/fixtures');
});

test('file allows reading the file contents as a buffer', () => {
  const file = builders.file('package.json');
  expect(JSON.parse(file.asBuffer().toString()).name).toEqual(
    '@votingworks/fixtures'
  );
});

test('file allows reading the file contents as a path', async () => {
  const file = builders.file('package.json');
  const tmpPath = file.asFilePath();
  expect(basename(tmpPath)).toEqual('package.json');
  expect(await readFile(tmpPath, 'utf-8')).toEqual(
    await readFile(join(__dirname, '../package.json'), 'utf-8')
  );
});

test('file throws when the file does not exist', () => {
  expect(() => builders.file('nonexistent')).toThrow();
});

test('directory allows reading the directory contents', async () => {
  const directory = builders.directory('src');
  expect(
    await readFile(join(directory.asDirectoryPath(), 'index.ts'), 'utf-8')
  ).toEqual(await readFile(join(__dirname, 'index.ts'), 'utf-8'));
});

test('election allows reading the election', () => {
  const election = builders.election('data/electionGeneral/election.json');
  expect(election.readElection().contests).toHaveLength(20);
});

test('election allows reading the election definition', () => {
  const election = builders.election('data/electionGeneral/election.json');
  expect(election.readElectionDefinition().ballotHash).toEqual(
    '083e2e0afbb19191a4d2850562ddef050ff860b0d61acee15d3bb26954932941'
  );
});

test('election allows converting to an election package', () => {
  const election = builders.election('data/electionGeneral/election.json');
  const electionPackage = election.toElectionPackage();
  expect(electionPackage.electionDefinition).toEqual(
    election.readElectionDefinition()
  );
  expect(electionPackage.systemSettings).toEqual(DEFAULT_SYSTEM_SETTINGS);

  expect(
    election.toElectionPackage({
      ...DEFAULT_SYSTEM_SETTINGS,
      allowOfficialBallotsInTestMode: true,
    }).systemSettings?.allowOfficialBallotsInTestMode
  ).toEqual(true);
});

test('image allows reading the image contents as a buffer', () => {
  const image = builders.image('data/sample-ballot-images/blank-page.png');
  expect(image.asBuffer().length).toEqual(9299);
});

test('image allows reading the image contents as a path', async () => {
  const image = builders.image('data/sample-ballot-images/blank-page.png');
  const tmpPath = image.asFilePath();
  expect(basename(tmpPath)).toEqual('blank-page.png');
  expect((await readFile(tmpPath)).length).toEqual(9299);
});

test('image allows reading the image data', async () => {
  const image = builders.image('data/sample-ballot-images/blank-page.png');
  const data = await image.asImageData();
  expect(data.width).toEqual(2544);
  expect(data.height).toEqual(3300);
});
