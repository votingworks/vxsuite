import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { createInterpreter } from './precinct_scanner_interpreter';

if (process.env.CI) {
  jest.setTimeout(20000);
}

const ballotImages = {
  overvoteBallot: [
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedOvervoteFront.asFilePath(),
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedOvervoteBack.asFilePath(),
  ],
} as const;

test('NH interpreter of overvote yields a sheet that needs to be reviewed', async () => {
  const interpreter = createInterpreter();

  interpreter.configure({
    electionDefinition:
      electionGridLayoutNewHampshireAmherstFixtures.electionDefinition,
    precinctSelection: ALL_PRECINCTS_SELECTION,
    layouts: [],
    ballotImagesPath: '',
    testMode: true,
  });

  const result = await interpreter.interpret(
    'foo-sheet-id',
    ballotImages.overvoteBallot
  );
  expect(result.ok()?.type).toBe('NeedsReviewSheet');
});
