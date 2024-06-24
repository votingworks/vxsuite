import { famousNamesFixtures } from '@votingworks/hmpb';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import {
  DEFAULT_MARK_THRESHOLDS,
  InterpretedHmpbPage,
  PageInterpretation,
  asSheet,
} from '@votingworks/types';
import { readElection } from '@votingworks/fs';
import { renderBmdBallotFixture } from '@votingworks/bmd-ballot-fixtures';
import { interpretSheet } from './interpret';
import { pdfToPageImagePaths } from '../test/helpers/interpretation';

test('interpret BMD ballot for an election supporting hand-marked paper ballots', async () => {
  const electionDefinition = (
    await readElection(famousNamesFixtures.electionPath)
  ).unsafeUnwrap();
  const bmdBallot = asSheet(
    await pdfToPageImagePaths(
      await renderBmdBallotFixture({
        electionDefinition,
        precinctId: famousNamesFixtures.precinctId,
        ballotStyleId: famousNamesFixtures.ballotStyleId,
        votes: famousNamesFixtures.votes,
      })
    )
  );

  const [bmdPage1Result, bmdPage2Result] = await interpretSheet(
    {
      electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    },
    bmdBallot
  );

  expect(bmdPage1Result.interpretation).toMatchObject<
    Partial<PageInterpretation>
  >({
    type: 'InterpretedBmdPage',
    votes: famousNamesFixtures.votes,
  });
  expect(bmdPage2Result.interpretation).toEqual<PageInterpretation>({
    type: 'BlankPage',
  });

  const hmpbBallot = asSheet(
    await pdfToPageImagePaths(famousNamesFixtures.markedBallotPath)
  );

  const [hmpbPage1Result, hmpbPage2Result] = await interpretSheet(
    {
      electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    },
    hmpbBallot
  );

  expect(hmpbPage1Result.interpretation).toMatchObject<
    Partial<PageInterpretation>
  >({
    type: 'InterpretedHmpbPage',
  });
  expect(hmpbPage2Result.interpretation).toMatchObject<
    Partial<PageInterpretation>
  >({
    type: 'InterpretedHmpbPage',
  });

  expect({
    ...(hmpbPage1Result.interpretation as InterpretedHmpbPage).votes,
    ...(hmpbPage2Result.interpretation as InterpretedHmpbPage).votes,
  }).toEqual(famousNamesFixtures.votes);
});
