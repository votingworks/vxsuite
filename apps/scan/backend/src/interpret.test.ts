import { assertDefined, iter, typedAs } from '@votingworks/basics';
import {
  DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
  DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
  DEFAULT_FAMOUS_NAMES_VOTES,
  renderBmdBallotFixture,
} from '@votingworks/bmd-ballot-fixtures';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { ImageData, pdfToImages } from '@votingworks/image-utils';
import {
  AdjudicationReason,
  DEFAULT_MARK_THRESHOLDS,
  ElectionDefinition,
  HmpbBallotPageMetadata,
  InterpretedHmpbPage,
  SheetOf,
  asSheet,
} from '@votingworks/types';
import { assert } from 'node:console';
import * as fs from 'node:fs/promises';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vite-plus/test';
import { interpret } from './interpret';

if (process.env.CI) {
  vi.setConfig({ testTimeout: 20_000 });
}

const { electionDefinition } = vxFamousNamesFixtures;

let ballotImages: {
  overvoteBallot: SheetOf<ImageData>;
  normalBallot: SheetOf<ImageData>;
  normalBmdBallot: SheetOf<ImageData>;
  undervoteBmdBallot: SheetOf<ImageData>;
};
let ballotImagesPath!: string;

async function ballotAsSheet(ballotPdf: Uint8Array) {
  return asSheet(
    await iter(pdfToImages(ballotPdf, { scale: 200 / 72 }))
      .map(({ page }) => page)
      .toArray()
  );
}

beforeAll(async () => {
  ballotImages = {
    overvoteBallot: await ballotAsSheet(
      Uint8Array.from(await fs.readFile(vxFamousNamesFixtures.markedBallotPath))
    ),
    normalBallot: await ballotAsSheet(
      Uint8Array.from(await fs.readFile(vxFamousNamesFixtures.blankBallotPath))
    ),
    normalBmdBallot: await ballotAsSheet(
      await renderBmdBallotFixture({ electionDefinition })
    ),
    undervoteBmdBallot: await ballotAsSheet(
      await renderBmdBallotFixture({
        electionDefinition,
        precinctId: DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
        ballotStyleId: DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
        votes: {
          ...DEFAULT_FAMOUS_NAMES_VOTES,
          'city-council': DEFAULT_FAMOUS_NAMES_VOTES['city-council']?.slice(
            0,
            1
          ),
        },
      })
    ),
  };
});

beforeEach(() => {
  ballotImagesPath = makeTemporaryDirectory();
});

afterEach(async () => {
  await fs.rm(ballotImagesPath, { recursive: true });
});

test('treats BMD ballot with one blank side as valid', async () => {
  const result = await interpret('foo-sheet-id', ballotImages.normalBmdBallot, {
    electionDefinition,
    validPrecinctIds: allPrecinctIds(electionDefinition),
    ballotImagesPath,
    testMode: true,
    markThresholds: DEFAULT_MARK_THRESHOLDS,
    adjudicationReasons: [],
  });
  expect(result.ok()?.type).toEqual('ValidSheet');
});

test('respects adjudication reasons for a BMD ballot on the front side', async () => {
  const result = await interpret(
    'foo-sheet-id',
    ballotImages.undervoteBmdBallot,
    {
      electionDefinition,
      validPrecinctIds: allPrecinctIds(electionDefinition),
      ballotImagesPath,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [AdjudicationReason.Undervote],
    }
  );
  const interpretation = assertDefined(result.ok());
  assert(interpretation.type === 'NeedsReviewSheet');

  // if statement for type narrowing only
  if (interpretation.type === 'NeedsReviewSheet') {
    expect(interpretation.reasons).toEqual([
      {
        contestId: 'city-council',
        expected: 4,
        optionIds: ['marie-curie'],
        type: 'Undervote',
      },
    ]);
  }
});

test('NH interpreter of overvote yields a sheet that needs to be reviewed', async () => {
  const result = await interpret('foo-sheet-id', ballotImages.overvoteBallot, {
    electionDefinition,
    validPrecinctIds: allPrecinctIds(electionDefinition),
    ballotImagesPath,
    testMode: true,
    markThresholds: DEFAULT_MARK_THRESHOLDS,
    adjudicationReasons: [AdjudicationReason.Overvote],
  });
  expect(result.ok()?.type).toEqual('NeedsReviewSheet');
});

test('NH interpreter with testMode=true', async () => {
  const sheet = (
    await interpret('foo-sheet-id', ballotImages.normalBallot, {
      electionDefinition,
      validPrecinctIds: allPrecinctIds(electionDefinition),
      ballotImagesPath,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [AdjudicationReason.Overvote],
    })
  ).unsafeUnwrap();
  expect(sheet.type).toEqual('ValidSheet');

  for (const page of sheet.pages) {
    expect(page.interpretation).toMatchObject<Partial<InterpretedHmpbPage>>({
      type: 'InterpretedHmpbPage',
      metadata: expect.objectContaining(
        typedAs<Partial<HmpbBallotPageMetadata>>({
          isTestMode: true,
        })
      ),
    });
  }
});

function allPrecinctIds(electionDef: ElectionDefinition) {
  return new Set(electionDef.election.precincts.map((p) => p.id));
}
