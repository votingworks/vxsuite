import { assert, Optional, range } from '@votingworks/basics';
import { allBubbleBallotFixtures } from '@votingworks/hmpb-render-backend';
import { Candidate, CandidateVote } from '@votingworks/types';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import {
  ballotPdfToPageImages,
  renderBallotToPageImages,
  sortVotesDict,
} from '../test/helpers/interpretation';
import { interpretSheet } from './interpret';

describe('Interpret - HMPB - All bubble ballot', () => {
  const {
    electionDefinition,
    blankBallotPath,
    filledBallotPath,
    cyclingTestDeck,
  } = allBubbleBallotFixtures;
  const { election } = electionDefinition;
  const precinctId = election.precincts[0]!.id;

  const [frontContest, backContest] = election.contests;
  assert(frontContest?.type === 'candidate');
  assert(backContest?.type === 'candidate');

  test('Blank ballot interpretation', async () => {
    const ballotImagePaths = await ballotPdfToPageImages(blankBallotPath);
    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        testMode: true,
      },
      ballotImagePaths
    );

    assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
    expect(frontResult.interpretation.votes).toEqual({});

    assert(backResult.interpretation.type === 'InterpretedHmpbPage');
    expect(backResult.interpretation.votes).toEqual({});
  });

  test('Filled ballot interpretation', async () => {
    const ballotImagePaths = await ballotPdfToPageImages(filledBallotPath);
    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        testMode: true,
      },
      ballotImagePaths
    );

    assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
    expect(frontResult.interpretation.votes).toEqual({
      [frontContest.id]: frontContest.candidates,
    });

    assert(backResult.interpretation.type === 'InterpretedHmpbPage');
    expect(backResult.interpretation.votes).toEqual({
      [backContest.id]: backContest.candidates,
    });
  });

  test('Cycling test deck interpretation', async () => {
    const votes = {
      [frontContest.id]: [] as Candidate[],
      [backContest.id]: [] as Candidate[],
    } as const;

    for (const card of range(0, 6)) {
      const ballotImagePaths = await renderBallotToPageImages({
        ...cyclingTestDeck,
        pages: cyclingTestDeck.pages.slice(card * 2, (card + 1) * 2),
      });
      const [frontResult, backResult] = await interpretSheet(
        {
          electionDefinition,
          precinctSelection: singlePrecinctSelectionFor(precinctId),
          testMode: true,
        },
        ballotImagePaths
      );

      assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
      assert(backResult.interpretation.type === 'InterpretedHmpbPage');

      for (const [contestId, candidates] of Object.entries({
        ...frontResult.interpretation.votes,
        ...backResult.interpretation.votes,
      })) {
        votes[contestId]!.push(
          ...((candidates as Optional<CandidateVote>) ?? [])
        );
      }
    }

    expect(sortVotesDict(votes)).toEqual(
      sortVotesDict({
        [frontContest.id]: frontContest.candidates,
        [backContest.id]: backContest.candidates,
      })
    );
  }, 30_000);
});
