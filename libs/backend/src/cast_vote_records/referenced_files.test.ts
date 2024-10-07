import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { sha256 } from 'js-sha256';
import path from 'node:path';
import { dirSync } from 'tmp';
import { err, ok, Result } from '@votingworks/basics';
import {
  BallotPageLayout,
  BallotStyleId,
  BallotType,
  ReadCastVoteRecordError,
} from '@votingworks/types';

import { referencedImageFile, referencedLayoutFile } from './referenced_files';

const imageContents = Buffer.of();
const expectedImageHash = sha256(imageContents);

const layout: BallotPageLayout = {
  contests: [],
  metadata: {
    ballotStyleId: '1' as BallotStyleId,
    ballotType: BallotType.Precinct,
    ballotHash: '1',
    isTestMode: false,
    pageNumber: 1,
    precinctId: '1',
  },
  pageSize: { height: 1, width: 1 },
};
const layoutFileContents = JSON.stringify(layout);
const expectedLayoutFileHash = sha256(layoutFileContents);
const invalidLayout = {} as const;
const invalidLayoutFileContents = JSON.stringify(invalidLayout);
const expectedInvalidLayoutFileHash = sha256(invalidLayoutFileContents);

let readFileSpy = jest.spyOn(fsPromises, 'readFile');
let tempDirectoryPath: string;
let imagePath: string;
let layoutFilePath: string;
let invalidLayoutFilePath: string;

beforeEach(() => {
  readFileSpy = jest.spyOn(fsPromises, 'readFile');

  tempDirectoryPath = dirSync().name;
  imagePath = path.join(tempDirectoryPath, 'file.jpg');
  fs.writeFileSync(imagePath, imageContents);
  layoutFilePath = path.join(tempDirectoryPath, 'file.layout.json');
  fs.writeFileSync(layoutFilePath, layoutFileContents);
  invalidLayoutFilePath = path.join(tempDirectoryPath, 'invalid.layout.json');
  fs.writeFileSync(invalidLayoutFilePath, invalidLayoutFileContents);
});

afterEach(() => {
  fs.rmSync(tempDirectoryPath, { recursive: true });
});

test.each<{
  setupFn?: () => void;
  inputGenerator: () => { expectedFileHash: string; filePath: string };
  expectedOutput: Result<Buffer, ReadCastVoteRecordError>;
}>([
  {
    inputGenerator: () => ({
      expectedFileHash: expectedImageHash,
      filePath: imagePath,
    }),
    expectedOutput: ok(imageContents),
  },
  {
    inputGenerator: () => ({
      expectedFileHash: expectedImageHash,
      filePath: 'non-existent-file-path',
    }),
    expectedOutput: err({
      type: 'invalid-cast-vote-record',
      subType: 'image-not-found',
    }),
  },
  {
    setupFn: () => {
      readFileSpy.mockRejectedValueOnce(new Error('Whoa!'));
    },
    inputGenerator: () => ({
      expectedFileHash: expectedImageHash,
      filePath: imagePath,
    }),
    expectedOutput: err({
      type: 'invalid-cast-vote-record',
      subType: 'image-read-error',
    }),
  },
  {
    inputGenerator: () => ({
      expectedFileHash: 'some-other-hash',
      filePath: imagePath,
    }),
    expectedOutput: err({
      type: 'invalid-cast-vote-record',
      subType: 'incorrect-image-hash',
    }),
  },
])(
  'referencedImageFile',
  async ({ setupFn, inputGenerator, expectedOutput }) => {
    setupFn?.();
    const imageFile = referencedImageFile(inputGenerator());
    expect(await imageFile.read()).toEqual(expectedOutput);
  }
);

test.each<{
  setupFn?: () => void;
  inputGenerator: () => { expectedFileHash: string; filePath: string };
  expectedOutput: Result<BallotPageLayout, ReadCastVoteRecordError>;
}>([
  {
    inputGenerator: () => ({
      expectedFileHash: expectedLayoutFileHash,
      filePath: layoutFilePath,
    }),
    expectedOutput: ok(layout),
  },
  {
    inputGenerator: () => ({
      expectedFileHash: expectedLayoutFileHash,
      filePath: 'non-existent-file-path',
    }),
    expectedOutput: err({
      type: 'invalid-cast-vote-record',
      subType: 'layout-file-not-found',
    }),
  },
  {
    setupFn: () => readFileSpy.mockRejectedValueOnce(new Error('Whoa!')),
    inputGenerator: () => ({
      expectedFileHash: expectedLayoutFileHash,
      filePath: layoutFilePath,
    }),
    expectedOutput: err({
      type: 'invalid-cast-vote-record',
      subType: 'layout-file-read-error',
    }),
  },
  {
    inputGenerator: () => ({
      expectedFileHash: 'some-other-hash',
      filePath: layoutFilePath,
    }),
    expectedOutput: err({
      type: 'invalid-cast-vote-record',
      subType: 'incorrect-layout-file-hash',
    }),
  },
  {
    inputGenerator: () => ({
      expectedFileHash: expectedInvalidLayoutFileHash,
      filePath: invalidLayoutFilePath,
    }),
    expectedOutput: err({
      type: 'invalid-cast-vote-record',
      subType: 'layout-file-parse-error',
    }),
  },
])(
  'referencedLayoutFile',
  async ({ setupFn, inputGenerator, expectedOutput }) => {
    setupFn?.();
    const layoutFile = referencedLayoutFile(inputGenerator());
    expect(await layoutFile.read()).toEqual(expectedOutput);
  }
);
