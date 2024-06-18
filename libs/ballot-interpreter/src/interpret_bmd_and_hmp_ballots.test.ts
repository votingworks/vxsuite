import { famousNamesFixtures } from '@votingworks/hmpb';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import {
  DEFAULT_MARK_THRESHOLDS,
  InterpretedHmpbPage,
  PageInterpretation,
} from '@votingworks/types';
import { readElection } from '@votingworks/fs';
import { assertDefined } from '@votingworks/basics';
import { ballotFixture, renderTestModeBallot } from '../test/helpers/ballots';
import { interpretSheet } from './interpret';

test('interpret BMD ballot for an election supporting hand-marked paper ballots', async () => {
  const electionDefinition = (
    await readElection(famousNamesFixtures.electionPath)
  ).unsafeUnwrap();
  const bmdBallot = ballotFixture(
    await renderTestModeBallot(
      electionDefinition,
      assertDefined(famousNamesFixtures.precinctId),
      assertDefined(famousNamesFixtures.ballotStyleId),
      famousNamesFixtures.votes
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
    await bmdBallot.asBmdSheetPaths()
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

  const hmpbBallot = ballotFixture(famousNamesFixtures.markedBallotPath);

  const [hmpbPage1Result, hmpbPage2Result] = await interpretSheet(
    {
      electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    },
    (await hmpbBallot.asHmpbPaths().toArray()) as [string, string]
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
