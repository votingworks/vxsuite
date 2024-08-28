import { iter, typedAs } from '@votingworks/basics';
import { renderBmdBallotFixture } from '@votingworks/bmd-ballot-fixtures';
import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
} from '@votingworks/fixtures';
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
import * as fs from 'fs/promises';
import { dirSync } from 'tmp';
import { combinePageInterpretationsForSheet, interpret } from './interpret';

if (process.env.CI) {
  jest.setTimeout(20_000);
}

let ballotImages: {
  overvoteBallot: SheetOf<ImageData>;
  normalBallot: SheetOf<ImageData>;
};
let ballotImagesPath!: string;

beforeAll(async () => {
  ballotImages = {
    overvoteBallot: [
      await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedOvervoteFront.asImageData(),
      await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedOvervoteBack.asImageData(),
    ],
    normalBallot: [
      await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedFront.asImageData(),
      await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedBack.asImageData(),
    ],
  };
});

beforeEach(() => {
  ballotImagesPath = dirSync().name;
});

afterEach(async () => {
  await fs.rm(ballotImagesPath, { recursive: true });
});

test('treats BMD ballot with one blank side as valid', async () => {
  const ballotPdf = await renderBmdBallotFixture({
    electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
  });
  const pageImages = asSheet(
    await iter(pdfToImages(ballotPdf, { scale: 200 / 72 }))
      .map(({ page }) => page)
      .toArray()
  );
  const result = await interpret('foo-sheet-id', pageImages, {
    electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
    precinctSelection: ALL_PRECINCTS_SELECTION,
    ballotImagesPath,
    testMode: true,
    markThresholds: DEFAULT_MARK_THRESHOLDS,
    adjudicationReasons: [],
  });
  expect(result.ok()?.type).toEqual('ValidSheet');
});

test('treats either page being an invalid test mode as an invalid sheet', () => {
  const invalidTestModePageInterpretation: PageInterpretation = {
    type: 'InvalidTestModePage',
    metadata: {
      ballotStyleId:
        electionFamousNames2021Fixtures.election.ballotStyles[0].id,
      precinctId:
        electionFamousNames2021Fixtures.election.ballotStyles[0].precincts[0],
      ballotType: BallotType.Precinct,
      ballotHash: electionFamousNames2021Fixtures.electionDefinition.ballotHash,
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

test('NH interpreter of overvote yields a sheet that needs to be reviewed', async () => {
  const result = await interpret('foo-sheet-id', ballotImages.overvoteBallot, {
    electionDefinition:
      electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition,
    precinctSelection: ALL_PRECINCTS_SELECTION,
    ballotImagesPath,
    testMode: true,
    markThresholds: DEFAULT_MARK_THRESHOLDS,
    adjudicationReasons: [AdjudicationReason.Overvote],
  });
  expect(result.ok()?.type).toEqual('NeedsReviewSheet');
});

test.each([true, false])(
  'NH interpreter with testMode=%s',
  async (testMode) => {
    const sheet = (
      await interpret('foo-sheet-id', ballotImages.normalBallot, {
        electionDefinition:
          electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        ballotImagesPath,
        testMode,
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
            isTestMode: testMode,
          })
        ),
      });
    }
  }
);
