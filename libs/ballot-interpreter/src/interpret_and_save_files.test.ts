import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { DEFAULT_MARK_THRESHOLDS, SheetOf } from '@votingworks/types';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { loadImageData } from '@votingworks/image-utils';
import { interpretSheetAndSaveImages } from './interpret';
import { tmpDir } from '../test/helpers/tmp';

test('interprets ballot images and saves images for storage', async () => {
  const fixtures = electionFamousNames2021Fixtures;
  const { electionDefinition } = fixtures;
  const bmdSummaryBallotPage = fixtures.machineMarkedBallotPage1.asFilePath();
  const bmdBlankPage = fixtures.machineMarkedBallotPage2.asFilePath();
  const validBmdSheet: SheetOf<string> = [bmdSummaryBallotPage, bmdBlankPage];

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
