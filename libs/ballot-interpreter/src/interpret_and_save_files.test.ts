import { expect, test } from 'vitest';
import {
  DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
  DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
  DEFAULT_FAMOUS_NAMES_VOTES,
  renderBmdBallotFixture,
} from '@votingworks/bmd-ballot-fixtures';
import { readFile } from 'node:fs/promises';
import { assertDefined } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { BLANK_PAGE_IMAGE_DATA, loadImageData } from '@votingworks/image-utils';
import {
  type BallotImageBitDepth,
  DEFAULT_MARK_THRESHOLDS,
  type ElectionDefinition,
  asSheet,
} from '@votingworks/types';
import { pdfToPageImages } from '../test/helpers/interpretation.js';
import { interpretSheetAndSaveImages } from './interpret.js';

test('interprets ballot images and saves images for storage', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const testBallot = asSheet(
    await pdfToPageImages(
      await renderBmdBallotFixture({
        electionDefinition,
        precinctId: DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
        ballotStyleId: DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
        votes: DEFAULT_FAMOUS_NAMES_VOTES,
      })
    ).toArray()
  );

  const ballotImagesPath = makeTemporaryDirectory();
  const result = await interpretSheetAndSaveImages(
    {
      electionDefinition,
      validPrecinctIds: allPrecinctIds(electionDefinition),
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    },
    testBallot,
    'sheet-id',
    ballotImagesPath
  );

  expect(result.map(({ interpretation }) => interpretation.type)).toEqual([
    'InterpretedBmdPage',
    'BlankPage',
  ]);
  for (const { imagePath } of result) {
    (await loadImageData(imagePath)).unsafeUnwrap();
  }
});

test('saves images even when interpretation fails', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();

  const ballotImagesPath = makeTemporaryDirectory();
  const result = await interpretSheetAndSaveImages(
    {
      electionDefinition,
      validPrecinctIds: allPrecinctIds(electionDefinition),
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    },
    [BLANK_PAGE_IMAGE_DATA, BLANK_PAGE_IMAGE_DATA],
    'sheet-id',
    ballotImagesPath
  );

  expect(result.map(({ interpretation }) => interpretation.type)).toEqual([
    'UnreadablePage',
    'UnreadablePage',
  ]);
  for (const { imagePath } of result) {
    (await loadImageData(imagePath)).unsafeUnwrap();
  }
});

function allPrecinctIds(electionDef: ElectionDefinition) {
  return new Set(electionDef.election.precincts.map((p) => p.id));
}

test.each<{ ballotImageBitDepth?: BallotImageBitDepth; expected: number }>([
  { ballotImageBitDepth: undefined, expected: 2 },
  { ballotImageBitDepth: 1, expected: 1 },
  { ballotImageBitDepth: 2, expected: 2 },
  { ballotImageBitDepth: 8, expected: 8 },
])(
  'saves HMPB images at the configured bit depth ($ballotImageBitDepth)',
  async ({ ballotImageBitDepth, expected }) => {
    const { electionDefinition, markedBallotPath } = vxFamousNamesFixtures;
    const images = asSheet(await pdfToPageImages(markedBallotPath).toArray());

    const result = await interpretSheetAndSaveImages(
      {
        electionDefinition,
        validPrecinctIds: new Set([
          assertDefined(vxFamousNamesFixtures.precinctId),
        ]),
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
        ballotImageBitDepth,
      },
      images,
      'sheet-id',
      makeTemporaryDirectory()
    );

    expect(result.map(({ interpretation }) => interpretation.type)).toEqual([
      'InterpretedHmpbPage',
      'InterpretedHmpbPage',
    ]);
    for (const { imagePath } of result) {
      const png = await readFile(imagePath);
      // IHDR: 8-byte signature, 4-byte length, 4-byte type, width, height, bit depth
      expect(png[24]).toEqual(expected);
      (await loadImageData(imagePath)).unsafeUnwrap();
    }
  }
);
