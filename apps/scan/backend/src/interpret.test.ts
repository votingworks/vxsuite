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
  BallotType,
  DEFAULT_MARK_THRESHOLDS,
  HmpbBallotPageMetadata,
  InterpretedHmpbPage,
  PageInterpretation,
  SheetInterpretation,
  SheetOf,
  asSheet,
} from '@votingworks/types';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { assert } from 'node:console';
import * as fs from 'node:fs/promises';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { combinePageInterpretationsForSheet, interpret } from './interpret';

if (process.env.CI) {
  vi.setConfig({ testTimeout: 20_000 });
}

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
      await renderBmdBallotFixture({
        electionDefinition: vxFamousNamesFixtures.electionDefinition,
      })
    ),
    undervoteBmdBallot: await ballotAsSheet(
      await renderBmdBallotFixture({
        electionDefinition: vxFamousNamesFixtures.electionDefinition,
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
    electionDefinition: vxFamousNamesFixtures.electionDefinition,
    precinctSelection: ALL_PRECINCTS_SELECTION,
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
      electionDefinition: vxFamousNamesFixtures.electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
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

test('treats either page being an invalid test mode as an invalid sheet', () => {
  const { election } = vxFamousNamesFixtures;
  const invalidTestModePageInterpretation: PageInterpretation = {
    type: 'InvalidTestModePage',
    metadata: {
      ballotStyleId: election.ballotStyles[0].id,
      precinctId: election.ballotStyles[0].precincts[0],
      ballotType: BallotType.Precinct,
      ballotHash: vxFamousNamesFixtures.electionDefinition.ballotHash,
      isTestMode: false,
      pageNumber: 1,
    },
  };
  const unreadablePage: PageInterpretation = {
    type: 'UnreadablePage',
  };

  expect(
    combinePageInterpretationsForSheet([
      {
        imagePath: 'front.jpeg',
        interpretation: invalidTestModePageInterpretation,
      },
      {
        imagePath: 'back.jpeg',
        interpretation: unreadablePage,
      },
    ])
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'invalid_test_mode',
  });
  expect(
    combinePageInterpretationsForSheet([
      {
        imagePath: 'front.jpeg',
        interpretation: unreadablePage,
      },
      {
        imagePath: 'back.jpeg',
        interpretation: invalidTestModePageInterpretation,
      },
    ])
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'invalid_test_mode',
  });
});

test('differentiates vertical streaks detected from other unreadable errors', () => {
  // The HMPB interpreter returns the same error for each page
  const verticalStreaksPageInterpretation: PageInterpretation = {
    type: 'UnreadablePage',
    reason: 'verticalStreaksDetected',
  };
  expect(
    combinePageInterpretationsForSheet([
      {
        imagePath: 'front.jpeg',
        interpretation: verticalStreaksPageInterpretation,
      },
      {
        imagePath: 'back.jpeg',
        interpretation: verticalStreaksPageInterpretation,
      },
    ])
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'vertical_streaks_detected',
  });
});

test('differentiates BMD ballot scanning disabled from other unreadable errors', () => {
  const bmdPageWhenBmdBallotScanningDisabledInterpretation: PageInterpretation =
    {
      type: 'UnreadablePage',
      reason: 'bmdBallotScanningDisabled',
    };
  expect(
    combinePageInterpretationsForSheet([
      {
        imagePath: 'front.jpeg',
        interpretation: bmdPageWhenBmdBallotScanningDisabledInterpretation,
      },
      {
        imagePath: 'back.jpeg',
        interpretation: bmdPageWhenBmdBallotScanningDisabledInterpretation,
      },
    ])
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'bmd_ballot_scanning_disabled',
  });
});

test('NH interpreter of overvote yields a sheet that needs to be reviewed', async () => {
  const result = await interpret('foo-sheet-id', ballotImages.overvoteBallot, {
    electionDefinition: vxFamousNamesFixtures.electionDefinition,
    precinctSelection: ALL_PRECINCTS_SELECTION,
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
      electionDefinition: vxFamousNamesFixtures.electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
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
