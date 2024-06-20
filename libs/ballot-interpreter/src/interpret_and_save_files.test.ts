import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { loadImageData } from '@votingworks/image-utils';
import { DEFAULT_MARK_THRESHOLDS } from '@votingworks/types';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import {
  DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
  DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
  DEFAULT_FAMOUS_NAMES_VOTES,
} from '../test/fixtures';
import { ballotFixture, renderTestModeBallot } from '../test/helpers/ballots';
import { tmpDir } from '../test/helpers/tmp';
import { interpretSheetAndSaveImages } from './interpret';

test('interprets ballot images and saves images for storage', async () => {
  const fixtures = electionFamousNames2021Fixtures;
  const { electionDefinition } = fixtures;
  const testBallot = ballotFixture(
    await renderTestModeBallot(
      fixtures.electionDefinition,
      DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
      DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
      DEFAULT_FAMOUS_NAMES_VOTES
    )
  );

  const validBmdSheet = await testBallot.asBmdSheetPaths();
  const ballotImagesPath = tmpDir();
  const result = await interpretSheetAndSaveImages(
    {
      electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    },
    validBmdSheet,
    'sheet-id',
    ballotImagesPath
  );

  expect(result.map(({ interpretation }) => interpretation.type)).toEqual([
    'InterpretedBmdPage',
    'BlankPage',
  ]);
  for (const { imagePath } of result) {
    await expect(loadImageData(imagePath)).resolves.toBeDefined();
  }
});
