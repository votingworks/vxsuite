import { describe, expect, test } from 'vitest';
import { CandidateContest, Tabulation } from '@votingworks/types';
import {
  electionWithMsEitherNeitherFixtures,
  readElectionGeneral,
  readElectionTwoPartyPrimary,
} from '@votingworks/fixtures';
import { getZeroCompressedTally } from '@votingworks/test-utils';
import { find, assert } from '@votingworks/basics';
import { compressTally, readCompressedTally } from './compressed_tallies';
import {
  buildElectionResultsFixture,
  getEmptyElectionResults,
} from './tabulation/index';

describe('compressTally', () => {
  test('compressTally returns empty tally when no contest tallies provided', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();
    const compressedTally = compressTally(
      electionEitherNeither,
      getEmptyElectionResults(electionEitherNeither)
    );
    // There should be a compressed tally for each contest
    expect(compressedTally.length).toEqual(
      electionEitherNeither.contests.length
    );
    // A candidate contest compressed tally should be all zeros
    expect(compressedTally[0]).toStrictEqual([0, 0, 0, 0, 0, 0, 0]);

    // A yes no contest compressed tally should be all zeros
    const yesNoContestIdx = electionEitherNeither.contests.findIndex(
      (contest) => contest.id === '750000017'
    );
    expect(compressedTally[yesNoContestIdx]).toStrictEqual([0, 0, 0, 0, 0]);
  });

  test('compressTally compresses a candidate tally properly', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();
    const presidentContest = find(
      electionEitherNeither.contests,
      (c): c is CandidateContest =>
        c.type === 'candidate' && c.id === '775020876'
    );
    const officialOptionTallies: Record<string, number> = {};
    for (const [idx, candidate] of presidentContest.candidates.entries()) {
      officialOptionTallies[candidate.id] = idx * 2;
    }
    officialOptionTallies[Tabulation.GENERIC_WRITE_IN_ID] = 5;

    const resultsWithPresidentTallies = buildElectionResultsFixture({
      election: electionEitherNeither,
      cardCounts: {
        bmd: 20,
        hmpb: [],
      },
      contestResultsSummaries: {
        '775020876': {
          type: 'candidate',
          undervotes: 5,
          overvotes: 4,
          ballots: 20,
          officialOptionTallies,
        },
      },
      includeGenericWriteIn: true,
    });
    const compressedTally = compressTally(
      electionEitherNeither,
      resultsWithPresidentTallies
    );
    expect(compressedTally).toHaveLength(electionEitherNeither.contests.length);
    expect(compressedTally[0]).toStrictEqual([5, 4, 20, 0, 2, 4, 5]);
  });

  test('compressTally compresses a yes no tally properly', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();
    const yesNoContestId = '750000017';
    const yesNoContestIdx = electionEitherNeither.contests.findIndex(
      (contest) => contest.id === yesNoContestId
    );
    const resultsWithYesNoTallies = buildElectionResultsFixture({
      election: electionEitherNeither,
      cardCounts: {
        bmd: 20,
        hmpb: [],
      },
      includeGenericWriteIn: true,
      contestResultsSummaries: {
        [yesNoContestId]: {
          type: 'yesno',
          ballots: 20,
          undervotes: 1,
          overvotes: 3,
          yesTally: 7,
          noTally: 9,
        },
      },
    });

    const compressedTally = compressTally(
      electionEitherNeither,
      resultsWithYesNoTallies
    );
    expect(compressedTally).toHaveLength(electionEitherNeither.contests.length);
    expect(compressedTally[yesNoContestIdx]).toStrictEqual([1, 3, 20, 7, 9]);
  });
});

const EMPTY_CARD_COUNTS: Tabulation.CardCounts = {
  bmd: 0,
  hmpb: [],
};

describe('readCompressTally', () => {
  test('reads a empty tally as expected', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();
    const zeroTally = getZeroCompressedTally(electionEitherNeither);
    const tally = readCompressedTally(
      electionEitherNeither,
      zeroTally,
      EMPTY_CARD_COUNTS
    );
    expect(tally.cardCounts).toEqual(EMPTY_CARD_COUNTS);
    // Check that all tallies are 0
    for (const contestTally of Object.values(tally.contestResults)) {
      assert(contestTally);
      expect(contestTally.ballots).toEqual(0);
      expect(contestTally.undervotes).toEqual(0);
      expect(contestTally.overvotes).toEqual(0);

      if (contestTally.contestType === 'yesno') {
        expect(contestTally.yesTally).toEqual(0);
        expect(contestTally.noTally).toEqual(0);
      } else {
        for (const optionTally of Object.values(contestTally.tallies)) {
          expect(optionTally.tally).toEqual(0);
        }
      }
    }
  });

  test('reads a candidate tally with write ins as expected', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();
    const compressedTally = getZeroCompressedTally(electionEitherNeither);
    compressedTally[0] = [5, 4, 20, 0, 2, 4, 5];
    const presidentContest = electionEitherNeither.contests.find(
      (contest) => contest.id === '775020876'
    );
    assert(presidentContest?.type === 'candidate');
    const tally = readCompressedTally(
      electionEitherNeither,
      compressedTally,
      EMPTY_CARD_COUNTS
    );
    const presidentTally = tally.contestResults['775020876'];
    assert(presidentTally);
    expect(presidentTally.ballots).toEqual(20);
    expect(presidentTally.undervotes).toEqual(5);
    expect(presidentTally.overvotes).toEqual(4);
    assert(presidentTally.contestType === 'candidate');
    expect(Object.keys(presidentTally.tallies)).toHaveLength(
      presidentContest.candidates.length + 1
    ); // 1 more then the number of candidates to include write ins
    expect(presidentTally.tallies['775031988']).toEqual({
      ...presidentContest.candidates.find((c) => c.id === '775031988')!,
      tally: 0,
    });
    expect(presidentTally.tallies['775031987']).toEqual({
      ...presidentContest.candidates.find((c) => c.id === '775031987')!,
      tally: 2,
    });
    expect(presidentTally.tallies['775031989']).toEqual({
      ...presidentContest.candidates.find((c) => c.id === '775031989')!,
      tally: 4,
    });
    expect(presidentTally.tallies[Tabulation.GENERIC_WRITE_IN_ID]).toEqual({
      ...Tabulation.GENERIC_WRITE_IN_CANDIDATE,
      tally: 5,
    });
  });

  test('reads a candidate tally without write ins as expected', () => {
    const election = readElectionGeneral();
    const compressedTally = getZeroCompressedTally(election);
    compressedTally[0] = [5, 4, 20, 3, 2, 2, 1, 1, 2, 50];
    const presidentContest = election.contests.find(
      (contest) => contest.id === 'president'
    );
    assert(presidentContest?.type === 'candidate');
    const tally = readCompressedTally(
      election,
      compressedTally,
      EMPTY_CARD_COUNTS
    );
    const presidentTally = tally.contestResults['president'];
    assert(presidentTally);
    expect(presidentTally.ballots).toEqual(20);
    expect(presidentTally.undervotes).toEqual(5);
    expect(presidentTally.overvotes).toEqual(4);
    assert(presidentTally.contestType === 'candidate');
    expect(Object.keys(presidentTally.tallies)).toHaveLength(
      presidentContest.candidates.length
    );
    expect(presidentTally.tallies['barchi-hallaren']).toEqual({
      ...presidentContest.candidates.find((c) => c.id === 'barchi-hallaren')!,
      tally: 3,
    });
    expect(presidentTally.tallies['cramer-vuocolo']).toEqual({
      ...presidentContest.candidates.find((c) => c.id === 'cramer-vuocolo')!,
      tally: 2,
    });
    expect(presidentTally.tallies['court-blumhardt']).toEqual({
      ...presidentContest.candidates.find((c) => c.id === 'court-blumhardt')!,
      tally: 2,
    });
    expect(presidentTally.tallies['boone-lian']).toEqual({
      ...presidentContest.candidates.find((c) => c.id === 'boone-lian')!,
      tally: 1,
    });
    expect(presidentTally.tallies['hildebrand-garritty']).toEqual({
      ...presidentContest.candidates.find(
        (c) => c.id === 'hildebrand-garritty'
      )!,
      tally: 1,
    });
    expect(presidentTally.tallies['patterson-lariviere']).toEqual({
      ...presidentContest.candidates.find(
        (c) => c.id === 'patterson-lariviere'
      )!,
      tally: 2,
    });
    expect(Object.keys(presidentTally.tallies)).not.toContain(
      Tabulation.GENERIC_WRITE_IN_ID
    );
  });

  test('reads a yes no tally as expected', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();
    const compressedTally = getZeroCompressedTally(electionEitherNeither);
    const yesNoContestIdx = electionEitherNeither.contests.findIndex(
      (contest) => contest.id === '750000017'
    );
    compressedTally[yesNoContestIdx] = [6, 4, 20, 3, 7];
    const yesNoContest = electionEitherNeither.contests[yesNoContestIdx];
    assert(yesNoContest?.type === 'yesno');
    const tally = readCompressedTally(
      electionEitherNeither,
      compressedTally,
      EMPTY_CARD_COUNTS
    );
    const yesNoTally = tally.contestResults['750000017'];
    assert(yesNoTally?.contestType === 'yesno');
    expect(yesNoTally.ballots).toEqual(20);
    expect(yesNoTally.undervotes).toEqual(6);
    expect(yesNoTally.overvotes).toEqual(4);
    expect(yesNoTally.yesTally).toEqual(3);
    expect(yesNoTally.noTally).toEqual(7);
  });
});

test('primary tally can compress and be read back and end with the original tally', () => {
  const election = readElectionTwoPartyPrimary();
  const expectedTally = buildElectionResultsFixture({
    election,
    cardCounts: EMPTY_CARD_COUNTS,
    contestResultsSummaries: {
      fishing: {
        type: 'yesno',
        ballots: 300,
        undervotes: 3,
        overvotes: 3,
        yesTally: 100,
        noTally: 196,
      },
    },
    includeGenericWriteIn: true,
  });

  const compressedTally = compressTally(election, expectedTally);
  const decompressedTally = readCompressedTally(
    election,
    compressedTally,
    EMPTY_CARD_COUNTS
  );

  // using toMatchObject because decompressed contains extra attributes
  expect(decompressedTally).toMatchObject(expectedTally);
});
