import { assert, Optional } from '@votingworks/basics';
import { readElection } from '@votingworks/fs';
import { allBubbleBallotFixtures } from '@votingworks/hmpb';
import {
  AdjudicationReason,
  Candidate,
  CandidateVote,
  DEFAULT_MARK_THRESHOLDS,
  ElectionDefinition,
} from '@votingworks/types';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { ballotFixture } from '../test/helpers/ballots';
import { sortVotesDict } from '../test/helpers/interpretation';
import { interpretSheet } from './interpret';

describe('Interpret - HMPB - All bubble ballot', () => {
  const {
    electionPath,
    blankBallotPath,
    filledBallotPath,
    cyclingTestDeckPath,
  } = allBubbleBallotFixtures;
  let electionDefinition: ElectionDefinition;
  beforeAll(async () => {
    electionDefinition = (await readElection(electionPath)).unsafeUnwrap();
  });

  test('Blank ballot interpretation', async () => {
    const precinctId = electionDefinition.election.precincts[0]!.id;
    const ballot = ballotFixture(blankBallotPath);
    const ballotImagePaths = await ballot.asHmpbPaths().toArray();
    expect(ballotImagePaths.length).toEqual(2);
    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [AdjudicationReason.Overvote],
      },
      ballotImagePaths as [string, string]
    );

    assert(frontResult.interpretation.type === 'InterpretedHmpbPage');
    expect(frontResult.interpretation.votes).toEqual({
      'test-contest-page-1': [],
    });

    assert(backResult.interpretation.type === 'InterpretedHmpbPage');
    expect(backResult.interpretation.votes).toEqual({
      'test-contest-page-2': [],
    });
  });

  test('Filled ballot interpretation', async () => {
    const precinctId = electionDefinition.election.precincts[0]!.id;
    const [frontContest, backContest] = electionDefinition.election.contests;
    assert(frontContest?.type === 'candidate');
    assert(backContest?.type === 'candidate');
    const ballot = ballotFixture(filledBallotPath);
    const ballotImagePaths = await ballot.asHmpbPaths().toArray();
    expect(ballotImagePaths.length).toEqual(2);
    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [AdjudicationReason.Overvote],
      },
      ballotImagePaths as [string, string]
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
    const precinctId = electionDefinition.election.precincts[0]!.id;
    const [frontContest, backContest] = electionDefinition.election.contests;
    assert(frontContest?.type === 'candidate');
    assert(backContest?.type === 'candidate');
    const votes = {
      [frontContest.id]: [] as Candidate[],
      [backContest.id]: [] as Candidate[],
    } as const;

    const ballot = ballotFixture(cyclingTestDeckPath);
    for await (const sheetImagePaths of ballot.asHmpbPaths().chunks(2)) {
      expect(sheetImagePaths.length).toEqual(2);
      const [frontResult, backResult] = await interpretSheet(
        {
          electionDefinition,
          precinctSelection: singlePrecinctSelectionFor(precinctId),
          testMode: true,
          markThresholds: DEFAULT_MARK_THRESHOLDS,
          adjudicationReasons: [AdjudicationReason.Overvote],
        },
        sheetImagePaths as [string, string]
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
  }, 60_000);
});
