import { expect, test } from 'vitest';
import {
  DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
  DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
  DEFAULT_FAMOUS_NAMES_VOTES,
  renderBmdBallotFixture,
} from '@votingworks/bmd-ballot-fixtures';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { loadImageData } from '@votingworks/image-utils';
import { DEFAULT_MARK_THRESHOLDS, asSheet } from '@votingworks/types';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { pdfToPageImages } from '../test/helpers/interpretation.mjs';
import { tmpDir } from '../test/helpers/tmp.mjs';
import { interpretSheetAndSaveImages } from './interpret.js';

test('interprets ballot images and saves images for storage', async () => {
  const fixtures = electionFamousNames2021Fixtures;
  const { electionDefinition } = fixtures;
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

  const ballotImagesPath = tmpDir();
  const result = await interpretSheetAndSaveImages(
    {
      electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
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
    await expect(loadImageData(imagePath)).resolves.toBeDefined();
  }
});
