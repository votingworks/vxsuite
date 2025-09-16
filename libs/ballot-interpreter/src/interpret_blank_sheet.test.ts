import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  sampleBallotImages,
} from '@votingworks/fixtures';
import { DEFAULT_MARK_THRESHOLDS, SheetOf } from '@votingworks/types';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { ImageData } from 'canvas';
import { beforeEach, expect, test, vi } from 'vitest';
import { interpretSheet } from './interpret';
import { normalizeBallotMode } from './validation';

vi.mock('./validation');

beforeEach(() => {
  vi.mocked(normalizeBallotMode).mockImplementation((input) => input);
});

test('blank sheet of paper', async () => {
  const sheet: SheetOf<ImageData> = [
    await sampleBallotImages.blankPage.asImageData(),
    await sampleBallotImages.blankPage.asImageData(),
  ];

  const interpretation = await interpretSheet(
    {
      electionDefinition:
        electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition(),
      precinctSelection: ALL_PRECINCTS_SELECTION,
      testMode: false,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    },
    sheet
  );

  expect(interpretation).toMatchSnapshot();
});
