import { beforeAll, expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sliceBallotHashForEncoding } from '@votingworks/ballot-encoder';
import {
  DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
  DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
  DEFAULT_FAMOUS_NAMES_VOTES,
  renderBmdBallotFixture,
} from '@votingworks/bmd-ballot-fixtures';
import {
  electionFamousNames2021Fixtures,
  makeTemporaryDirectory,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import { createImageData, loadImageMetadata } from '@votingworks/image-utils';
import { type RgbaImageData, asSheet } from '@votingworks/types';
import {
  makeInterpreterDb,
  pdfToPageImages,
} from '../test/helpers/interpretation.js';
import type { BridgeSummaryBallotOptions } from '../index.js';
import { napi } from './bubble-ballot-ts/napi.js';
import { rotateImageData180 } from '../test/helpers/rotate.js';

const electionDefinition =
  electionFamousNames2021Fixtures.baseElection_DEPRECATED.readElectionDefinition();
let options: BridgeSummaryBallotOptions;
let summaryPage: RgbaImageData;
let blankPage: RgbaImageData;

beforeAll(async () => {
  options = { dbPath: await makeInterpreterDb(electionDefinition) };
  [summaryPage, blankPage] = asSheet(
    await pdfToPageImages(
      await renderBmdBallotFixture({
        electionDefinition,
        precinctId: DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
        ballotStyleId: DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
        votes: DEFAULT_FAMOUS_NAMES_VOTES,
      })
    ).toArray()
  );
});

function rotated180(image: RgbaImageData): RgbaImageData {
  const copy = createImageData(
    Uint8ClampedArray.from(image.data),
    image.width,
    image.height
  );
  rotateImageData180(copy);
  return copy;
}

test('decodes the summary ballot on side A', async () => {
  const result = await napi.interpretSummaryBallot(
    summaryPage,
    blankPage,
    options
  );
  expect(result.type).toEqual('ok');
  if (result.type !== 'ok') return;
  expect(result.value.side).toEqual('front');
  expect(result.value.record).toMatchObject({
    ballotStyleId: DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
    precinctId: DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
  });
  expect(Object.keys(result.value.record.votes).sort()).toEqual(
    Object.keys(DEFAULT_FAMOUS_NAMES_VOTES).sort()
  );
});

test('decodes the summary ballot on side B', async () => {
  const result = await napi.interpretSummaryBallot(
    blankPage,
    summaryPage,
    options
  );
  expect(result).toMatchObject({ type: 'ok', value: { side: 'back' } });
});

test('writes the upright summary ballot of a single page', async () => {
  const outputDir = makeTemporaryDirectory();
  const uprightPath = join(outputDir, 'upright.png');
  const upsideDownPath = join(outputDir, 'upside-down.png');

  const [upright, upsideDown] = await Promise.all([
    napi.interpretSummaryBallot(summaryPage, undefined, {
      ...options,
      frontNormalizedImageOutputPath: uprightPath,
    }),
    napi.interpretSummaryBallot(rotated180(summaryPage), undefined, {
      ...options,
      frontNormalizedImageOutputPath: upsideDownPath,
    }),
  ]);

  expect(upsideDown).toEqual(upright);
  const [uprightPng, upsideDownPng] = await Promise.all([
    readFile(uprightPath),
    readFile(upsideDownPath),
  ]);
  expect(upsideDownPng.equals(uprightPng)).toEqual(true);
});

test('reports blank pages and writes the input images', async () => {
  const outputDir = makeTemporaryDirectory();
  const frontPath = join(outputDir, 'front.png');
  const backPath = join(outputDir, 'back.png');

  const result = await napi.interpretSummaryBallot(blankPage, blankPage, {
    ...options,
    frontNormalizedImageOutputPath: frontPath,
    backNormalizedImageOutputPath: backPath,
  });

  expect(result).toEqual({
    type: 'err',
    value: { type: 'votesNotFound', sideA: 'blankPage', sideB: 'blankPage' },
  });
  for (const path of [frontPath, backPath]) {
    expect((await loadImageMetadata(path)).unsafeUnwrap()).toMatchObject({
      width: blankPage.width,
      height: blankPage.height,
    });
  }
});

test('reports summary ballots on both sides', async () => {
  const result = await napi.interpretSummaryBallot(
    summaryPage,
    summaryPage,
    options
  );
  expect(result).toMatchObject({
    type: 'err',
    value: { type: 'multipleQrCodes' },
  });
});

test('reports a summary ballot for another election', async () => {
  const otherElectionDefinition = readElectionGeneralDefinition();
  const result = await napi.interpretSummaryBallot(summaryPage, undefined, {
    dbPath: await makeInterpreterDb(otherElectionDefinition),
  });
  expect(result).toEqual({
    type: 'err',
    value: {
      type: 'mismatchedElection',
      expectedBallotHash: sliceBallotHashForEncoding(
        otherElectionDefinition.ballotHash
      ),
      actualBallotHash: sliceBallotHashForEncoding(
        electionDefinition.ballotHash
      ),
    },
  });
});

test('rejects a missing election DB', async () => {
  await expect(
    napi.interpretSummaryBallot(summaryPage, undefined, {
      dbPath: '/nonexistent/election-package.db',
    })
  ).rejects.toThrow('connecting to election DB');
});

test('reads the election from JSON', async () => {
  const result = await napi.interpretSummaryBallot(summaryPage, undefined, {
    electionJson: JSON.stringify(electionDefinition.election),
    ballotHash: electionDefinition.ballotHash,
  });
  expect(result).toMatchObject({ type: 'ok', value: { side: 'front' } });
});

test('rejects unparseable election JSON', async () => {
  await expect(
    napi.interpretSummaryBallot(summaryPage, undefined, {
      electionJson: '{}',
      ballotHash: electionDefinition.ballotHash,
    })
  ).rejects.toThrow('parsing election');
});
