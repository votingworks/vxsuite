import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
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

vi.mock(import('node:fs/promises'), async (importActual) => ({
  ...(await importActual()),
  readFile: vi.fn().mockImplementation(() => {
    // eslint-disable-next-line no-console
    console.error('fs/promises.readFile should be mocked');
    throw new Error('fs/promises.readFile should be mocked');
  }),
}));

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

let tempDirectoryPath: string;
let imagePath: string;
let layoutFilePath: string;
let invalidLayoutFilePath: string;

beforeEach(() => {
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
  name: string;
  setupFn: () => void;
  inputGenerator: () => { expectedFileHash: string; filePath: string };
  expectedOutput: Result<Buffer, ReadCastVoteRecordError>;
}>([
  {
    name: 'valid image file',
    setupFn: () =>
      vi.mocked(fsPromises.readFile).mockResolvedValue(imageContents),
    inputGenerator: () => ({
      expectedFileHash: expectedImageHash,
      filePath: imagePath,
    }),
    expectedOutput: ok(imageContents),
  },
  {
    name: 'non-existent image file',
    setupFn: () => {
      const error = new Error('ENOENT: no such file or directory');
      Object.defineProperty(error, 'code', { value: 'ENOENT' });
      vi.mocked(fsPromises.readFile).mockRejectedValue(error);
    },
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
    name: 'image file read error',
    setupFn: () => {
      vi.mocked(fsPromises.readFile).mockRejectedValueOnce(new Error('Whoa!'));
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
    name: 'incorrect image file hash',
    setupFn: () =>
      vi.mocked(fsPromises.readFile).mockResolvedValue(imageContents),
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
  'referencedImageFile: $name',
  async ({ setupFn, inputGenerator, expectedOutput }) => {
    setupFn?.();
    const imageFile = referencedImageFile(inputGenerator());
    expect(await imageFile.read()).toEqual(expectedOutput);
  }
);

test.each<{
  name: string;
  setupFn: () => void;
  inputGenerator: () => { expectedFileHash: string; filePath: string };
  expectedOutput: Result<BallotPageLayout, ReadCastVoteRecordError>;
}>([
  {
    name: 'valid layout file',
    setupFn: () =>
      vi.mocked(fsPromises.readFile).mockResolvedValue(layoutFileContents),
    inputGenerator: () => ({
      expectedFileHash: expectedLayoutFileHash,
      filePath: layoutFilePath,
    }),
    expectedOutput: ok(layout),
  },
  {
    name: 'non-existent layout file',
    setupFn: () => {
      const error = new Error('ENOENT: no such file or directory');
      Object.defineProperty(error, 'code', { value: 'ENOENT' });
      vi.mocked(fsPromises.readFile).mockRejectedValue(error);
    },
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
    name: 'layout file read error',
    setupFn: () =>
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('Whoa!')),
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
    name: 'incorrect layout file hash',
    setupFn: () =>
      vi.mocked(fsPromises.readFile).mockResolvedValue(layoutFileContents),
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
    name: 'invalid layout file',
    setupFn: () =>
      vi
        .mocked(fsPromises.readFile)
        .mockResolvedValue(invalidLayoutFileContents),
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
  'referencedLayoutFile: $name',
  async ({ setupFn, inputGenerator, expectedOutput }) => {
    setupFn?.();
    const layoutFile = referencedLayoutFile(inputGenerator());
    expect(await layoutFile.read()).toEqual(expectedOutput);
  }
);
