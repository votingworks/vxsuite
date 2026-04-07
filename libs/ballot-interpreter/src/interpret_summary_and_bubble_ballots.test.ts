import { expect, test } from 'vitest';
import { renderBmdBallotFixture } from '@votingworks/bmd-ballot-fixtures';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import {
  CandidateContest,
  DEFAULT_MARK_THRESHOLDS,
  ElectionDefinition,
  InterpretedHmpbPage,
  PageInterpretation,
  VotesDict,
  asSheet,
} from '@votingworks/types';
import { CachedElectionLookups } from '@votingworks/utils';
import { pdfToPageImages } from '../test/helpers/interpretation';
import { interpretSheet } from './interpret';

test('interpret BMD ballot for an election supporting hand-marked paper ballots', async () => {
  const { electionDefinition } = vxFamousNamesFixtures;
  // Fixture votes includes overvotes, which aren't possible on a BMD ballot
  const validBmdVotes: VotesDict = Object.fromEntries(
    Object.entries(vxFamousNamesFixtures.votes).map(([contestId, vote]) => [
      contestId,
      vote?.slice(
        0,
        (
          CachedElectionLookups.getContestById(
            electionDefinition,
            contestId
          ) as CandidateContest
        ).seats
      ),
    ])
  );
  const bmdBallot = asSheet(
    await pdfToPageImages(
      await renderBmdBallotFixture({
        electionDefinition,
        precinctId: vxFamousNamesFixtures.precinctId,
        ballotStyleId: vxFamousNamesFixtures.ballotStyleId,
        votes: validBmdVotes,
      })
    ).toArray()
  );

  const validPrecinctIds = allPrecinctIds(electionDefinition);
  const [bmdPage1Result, bmdPage2Result] = await interpretSheet(
    {
      electionDefinition,
      validPrecinctIds,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    },
    bmdBallot
  );

  expect(bmdPage1Result).toMatchObject<Partial<PageInterpretation>>({
    type: 'InterpretedBmdPage',
    votes: validBmdVotes,
  });
  expect(bmdPage2Result).toEqual<PageInterpretation>({
    type: 'BlankPage',
  });

  const hmpbBallot = asSheet(
    await pdfToPageImages(vxFamousNamesFixtures.markedBallotPath).toArray()
  );

  const [hmpbPage1Result, hmpbPage2Result] = await interpretSheet(
    {
      electionDefinition,
      validPrecinctIds,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    },
    hmpbBallot
  );

  expect(hmpbPage1Result).toMatchObject<Partial<PageInterpretation>>({
    type: 'InterpretedHmpbPage',
  });
  expect(hmpbPage2Result).toMatchObject<Partial<PageInterpretation>>({
    type: 'InterpretedHmpbPage',
  });

  expect({
    ...(hmpbPage1Result as InterpretedHmpbPage).votes,
    ...(hmpbPage2Result as InterpretedHmpbPage).votes,
  }).toEqual(vxFamousNamesFixtures.votes);
});

// Regression test for a bug where the HMPB interpretation was taking precedence
// over the BMD interpretation in this specific case
test('interpret BMD ballot with test/official ballot mode mismatch error', async () => {
  const { electionDefinition } = vxFamousNamesFixtures;
  const bmdBallot = asSheet(
    await pdfToPageImages(
      // Test mode ballot
      await renderBmdBallotFixture({
        electionDefinition,
        precinctId: vxFamousNamesFixtures.precinctId,
        ballotStyleId: vxFamousNamesFixtures.ballotStyleId,
        votes: vxFamousNamesFixtures.votes,
      })
    ).toArray()
  );

  const [bmdPage1Result, bmdPage2Result] = await interpretSheet(
    {
      electionDefinition,
      validPrecinctIds: allPrecinctIds(electionDefinition),
      // Mode mismatch
      testMode: false,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    },
    bmdBallot
  );

  expect(bmdPage1Result).toMatchObject<Partial<PageInterpretation>>({
    type: 'InvalidTestModePage',
  });
  expect(bmdPage2Result).toEqual<PageInterpretation>({
    type: 'BlankPage',
  });
});

function allPrecinctIds(electionDef: ElectionDefinition) {
  return new Set(electionDef.election.precincts.map((p) => p.id));
}
