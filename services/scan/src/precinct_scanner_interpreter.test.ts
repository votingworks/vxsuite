import {
  electionGridLayoutDefinition,
  electionGridLayoutFixtures,
} from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { createInterpreter } from './precinct_scanner_interpreter';

const ballotImages = {
  overvoteBallot: [
    electionGridLayoutFixtures.ballotPage1.asFilePath(),
    electionGridLayoutFixtures.ballotPage2.asFilePath(),
  ],
} as const;

test('NH interpreter of overvote yields a sheet that needs to be reviewed', async () => {
  const interpreter = createInterpreter();

  interpreter.configure({
    electionDefinition: electionGridLayoutDefinition,
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
