import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import {
  HmpbBallotPageMetadata,
  HmpbPageInterpretation,
} from '@votingworks/types';
import { ALL_PRECINCTS_SELECTION, typedAs } from '@votingworks/utils';
import * as fs from 'fs/promises';
import { dirSync } from 'tmp';
import { createInterpreter } from './interpret';

if (process.env.CI) {
  jest.setTimeout(20_000);
}

const ballotImages = {
  overvoteBallot: [
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedOvervoteFront.asFilePath(),
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedOvervoteBack.asFilePath(),
  ],
  normalBallot: [
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedFront.asFilePath(),
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedBack.asFilePath(),
  ],
} as const;

let ballotImagesPath!: string;

beforeEach(() => {
  ballotImagesPath = dirSync().name;
});

afterEach(async () => {
  await fs.rm(ballotImagesPath, { recursive: true });
});

test('NH interpreter of overvote yields a sheet that needs to be reviewed', async () => {
  const interpreter = createInterpreter();

  interpreter.configure({
    electionDefinition:
      electionGridLayoutNewHampshireAmherstFixtures.electionDefinition,
    precinctSelection: ALL_PRECINCTS_SELECTION,
    layouts: [],
    ballotImagesPath,
    testMode: true,
  });

  const result = await interpreter.interpret(
    'foo-sheet-id',
    ballotImages.overvoteBallot
  );
  expect(result.ok()?.type).toBe('NeedsReviewSheet');
});

test.each([true, false])(
  'NH interpreter with testMode=%s',
  async (testMode) => {
    const interpreter = createInterpreter();

    interpreter.configure({
      electionDefinition:
        electionGridLayoutNewHampshireAmherstFixtures.electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      layouts: [],
      ballotImagesPath,
      testMode,
    });

    const sheet = (
      await interpreter.interpret('foo-sheet-id', ballotImages.normalBallot)
    ).unsafeUnwrap();
    expect(sheet.type).toBe('ValidSheet');

    for (const page of sheet.pages) {
      expect(page.interpretation).toEqual(
        expect.objectContaining(
          typedAs<Partial<HmpbPageInterpretation>>({
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
