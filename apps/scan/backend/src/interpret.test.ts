import { typedAs } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
} from '@votingworks/fixtures';
import {
  AdjudicationReason,
  DEFAULT_MARK_THRESHOLDS,
  HmpbBallotPageMetadata,
  InterpretedHmpbPage,
} from '@votingworks/types';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import * as fs from 'fs/promises';
import { dirSync } from 'tmp';
import { interpret } from './interpret';

if (process.env.CI) {
  jest.setTimeout(20_000);
}

const ballotImages = {
  overvoteBallot: [
    electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedOvervoteFront.asFilePath(),
    electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedOvervoteBack.asFilePath(),
  ],
  normalBallot: [
    electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedFront.asFilePath(),
    electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedBack.asFilePath(),
  ],
  bmdBallot: [
    electionFamousNames2021Fixtures.machineMarkedBallotPage1.asFilePath(),
    // 2nd page is blank
    electionFamousNames2021Fixtures.machineMarkedBallotPage2.asFilePath(),
  ],
} as const;

let ballotImagesPath!: string;

beforeEach(() => {
  ballotImagesPath = dirSync().name;
});

afterEach(async () => {
  await fs.rm(ballotImagesPath, { recursive: true });
});

test('treats BMD ballot with one blank side as valid', async () => {
  const result = await interpret('foo-sheet-id', ballotImages.bmdBallot, {
    electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
    precinctSelection: ALL_PRECINCTS_SELECTION,
    ballotImagesPath,
    testMode: true,
    markThresholds: DEFAULT_MARK_THRESHOLDS,
    adjudicationReasons: [],
  });
  expect(result.ok()?.type).toEqual('ValidSheet');
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
      expect(page.interpretation).toEqual(
        expect.objectContaining(
          typedAs<Partial<InterpretedHmpbPage>>({
            type: 'InterpretedHmpbPage',
            metadata: expect.objectContaining(
              typedAs<Partial<HmpbBallotPageMetadata>>({
                isTestMode: testMode,
              })
            ),
          })
        )
      );
    }
  }
);
