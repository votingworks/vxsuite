import { beforeAll, describe, expect, test } from 'vitest';
import { assert, Optional } from '@votingworks/basics';
import { readElection } from '@votingworks/fs';
import { allBubbleBallotFixtures } from '@votingworks/hmpb';
import {
  AdjudicationReason,
  asSheet,
  Candidate,
  CandidateVote,
  DEFAULT_MARK_THRESHOLDS,
  ElectionDefinition,
  HmpbBallotPaperSize,
} from '@votingworks/types';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { pdfToPageImages, sortVotesDict } from '../test/helpers/interpretation';
import { interpretSheet } from './interpret';

describe('Interpret - HMPB - All bubble ballot', () => {
  const {
    electionPath,
    blankBallotPath,
    filledBallotPath,
    cyclingTestDeckPath,
  } = allBubbleBallotFixtures(HmpbBallotPaperSize.Letter);
  let electionDefinition: ElectionDefinition;
  beforeAll(async () => {
    electionDefinition = (await readElection(electionPath)).unsafeUnwrap();
  });

  test('Blank ballot interpretation', async () => {
    const precinctId = electionDefinition.election.precincts[0]!.id;
    const images = asSheet(await pdfToPageImages(blankBallotPath).toArray());
    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [AdjudicationReason.Overvote],
      },
      images
    );

    assert(frontResult.type === 'InterpretedHmpbPage');
    expect(frontResult.votes).toEqual({
      'test-contest-page-1': [],
    });

    assert(backResult.type === 'InterpretedHmpbPage');
    expect(backResult.votes).toEqual({
      'test-contest-page-2': [],
    });
  });

  test('Filled ballot interpretation', async () => {
    const precinctId = electionDefinition.election.precincts[0]!.id;
    const [frontContest, backContest] = electionDefinition.election.contests;
    assert(frontContest?.type === 'candidate');
    assert(backContest?.type === 'candidate');
    const images = asSheet(await pdfToPageImages(filledBallotPath).toArray());
    const [frontResult, backResult] = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [AdjudicationReason.Overvote],
      },
      images
    );

    assert(frontResult.type === 'InterpretedHmpbPage');
    expect(frontResult.votes).toEqual({
      [frontContest.id]: frontContest.candidates,
    });

    assert(backResult.type === 'InterpretedHmpbPage');
    expect(backResult.votes).toEqual({
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

    const ballotImagePaths = pdfToPageImages(cyclingTestDeckPath);
    for await (const sheetImages of ballotImagePaths.chunksExact(2)) {
      const [frontResult, backResult] = await interpretSheet(
        {
          electionDefinition,
          precinctSelection: singlePrecinctSelectionFor(precinctId),
          testMode: true,
          markThresholds: DEFAULT_MARK_THRESHOLDS,
          adjudicationReasons: [AdjudicationReason.Overvote],
        },
        sheetImages
      );

      assert(frontResult.type === 'InterpretedHmpbPage');
      assert(backResult.type === 'InterpretedHmpbPage');

      for (const [contestId, candidates] of Object.entries({
        ...frontResult.votes,
        ...backResult.votes,
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
