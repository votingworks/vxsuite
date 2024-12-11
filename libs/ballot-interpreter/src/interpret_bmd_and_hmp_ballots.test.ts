import { expect, test } from 'vitest';
import { renderBmdBallotFixture } from '@votingworks/bmd-ballot-fixtures';
import { famousNamesFixtures } from '@votingworks/hmpb';
import {
  DEFAULT_MARK_THRESHOLDS,
  InterpretedHmpbPage,
  PageInterpretation,
  asSheet,
} from '@votingworks/types';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { pdfToPageImages } from '../test/helpers/interpretation';
import { interpretSheet } from './interpret';

test('interpret BMD ballot for an election supporting hand-marked paper ballots', async () => {
  const { electionDefinition } = famousNamesFixtures;
  const bmdBallot = asSheet(
    await pdfToPageImages(
      await renderBmdBallotFixture({
        electionDefinition,
        precinctId: famousNamesFixtures.precinctId,
        ballotStyleId: famousNamesFixtures.ballotStyleId,
        votes: famousNamesFixtures.votes,
      })
    ).toArray()
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
    await pdfToPageImages(famousNamesFixtures.markedBallotPath).toArray()
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

// Regression test for a bug where the HMPB interpretation was taking precedence
// over the BMD interpretation in this specific case
test('interpret BMD ballot with test/official ballot mode mismatch error', async () => {
  const { electionDefinition } = famousNamesFixtures;
  const bmdBallot = asSheet(
    await pdfToPageImages(
      // Test mode ballot
      await renderBmdBallotFixture({
        electionDefinition,
        precinctId: famousNamesFixtures.precinctId,
        ballotStyleId: famousNamesFixtures.ballotStyleId,
        votes: famousNamesFixtures.votes,
      })
    ).toArray()
  );

  const [bmdPage1Result, bmdPage2Result] = await interpretSheet(
    {
      electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      // Mode mismatch
      testMode: false,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    },
    bmdBallot
  );

  expect(bmdPage1Result.interpretation).toMatchObject<
    Partial<PageInterpretation>
  >({ type: 'InvalidTestModePage' });
  expect(bmdPage2Result.interpretation).toEqual<PageInterpretation>({
    type: 'BlankPage',
  });
});
