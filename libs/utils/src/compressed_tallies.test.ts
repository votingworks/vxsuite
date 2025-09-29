import { describe, expect, test } from 'vitest';
import {
  CandidateContest,
  CandidateContestCompressedTally,
  CompressedTally,
  Election,
  Tabulation,
} from '@votingworks/types';
import {
  electionWithMsEitherNeitherFixtures,
  readElectionGeneral,
  readElectionTwoPartyPrimary,
} from '@votingworks/fixtures';
import { find, assert } from '@votingworks/basics';
import {
  compressAndEncodeTally,
  compressTally,
  decodeCompressedTally,
  encodeCompressedTally,
  readCompressedTally,
} from './compressed_tallies';
import {
  buildElectionResultsFixture,
  getEmptyElectionResults,
} from './tabulation/index';

function getZeroCompressedTally(election: Election): CompressedTally {
  const mockResults = buildElectionResultsFixture({
    election,
    cardCounts: {
      bmd: 0,
      hmpb: [],
    },
    contestResultsSummaries: {},
    includeGenericWriteIn: true,
  });
  return compressTally(election, mockResults);
}

describe('compressTally', () => {
  test('compressTally returns empty tally when no contest tallies provided', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();
    const compressedTally = compressAndEncodeTally(
      electionEitherNeither,
      getEmptyElectionResults(electionEitherNeither)
    );
    expect(compressedTally).toMatchInlineSnapshot(
      `"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"`
    );
    const decodedCompressedTally = decodeCompressedTally(
      compressedTally,
      electionEitherNeither
    );
    // There should be a compressed tally for each contest
    expect(decodedCompressedTally.length).toEqual(
      electionEitherNeither.contests.length
    );
    // A candidate contest compressed tally should be all zeros
    expect(decodedCompressedTally[0]).toStrictEqual([0, 0, 0, 0, 0, 0, 0]);

    // A yes no contest compressed tally should be all zeros
    const yesNoContestIdx = electionEitherNeither.contests.findIndex(
      (contest) => contest.id === '750000017'
    );
    expect(decodedCompressedTally[yesNoContestIdx]).toStrictEqual([
      0, 0, 0, 0, 0,
    ]);
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
    const compressedTally = compressAndEncodeTally(
      electionEitherNeither,
      resultsWithPresidentTallies
    );
    expect(compressedTally).toMatchInlineSnapshot(
      `"BQAEABQAAAACAAQABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"`
    );
    const decodedCompressedTally = decodeCompressedTally(
      compressedTally,
      electionEitherNeither
    );
    expect(decodedCompressedTally).toHaveLength(
      electionEitherNeither.contests.length
    );
    expect(decodedCompressedTally[0]).toStrictEqual([5, 4, 20, 0, 2, 4, 5]);
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

    const compressedTally = compressAndEncodeTally(
      electionEitherNeither,
      resultsWithYesNoTallies
    );
    expect(compressedTally).toMatchInlineSnapshot(
      `"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAwAUAAcACQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"`
    );
    const decodedCompressedTally = decodeCompressedTally(
      compressedTally,
      electionEitherNeither
    );
    expect(decodedCompressedTally).toHaveLength(
      electionEitherNeither.contests.length
    );
    expect(decodedCompressedTally[yesNoContestIdx]).toStrictEqual([
      1, 3, 20, 7, 9,
    ]);
  });
});

describe('readCompressTally', () => {
  test('reads a empty tally as expected', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();
    const zeroTally = getZeroCompressedTally(electionEitherNeither);
    const tally = readCompressedTally(
      electionEitherNeither,
      encodeCompressedTally(zeroTally)
    );
    // Check that all tallies are 0
    for (const contestTally of Object.values(tally)) {
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
    compressedTally[0] = [
      5, 4, 20, 0, 2, 4, 5,
    ] as CandidateContestCompressedTally;
    const presidentContest = electionEitherNeither.contests.find(
      (contest) => contest.id === '775020876'
    );
    assert(presidentContest?.type === 'candidate');
    const tally = readCompressedTally(
      electionEitherNeither,
      encodeCompressedTally(compressedTally)
    );
    const presidentTally = tally['775020876'];
    assert(presidentTally);
    expect(presidentTally.ballots).toEqual(20);
    expect(presidentTally.undervotes).toEqual(5);
    expect(presidentTally.overvotes).toEqual(4);
    assert(presidentTally.contestType === 'candidate');
    expect(Object.keys(presidentTally.tallies)).toHaveLength(
      presidentContest.candidates.length + 1
    ); // 1 more then the number of candidates to include write ins
    expect(presidentTally.tallies['775031988']).toEqual({
      id: presidentContest.candidates.find((c) => c.id === '775031988')!.id,
      name: presidentContest.candidates.find((c) => c.id === '775031988')!.name,
      tally: 0,
    });
    expect(presidentTally.tallies['775031987']).toEqual({
      id: presidentContest.candidates.find((c) => c.id === '775031987')!.id,
      name: presidentContest.candidates.find((c) => c.id === '775031987')!.name,
      tally: 2,
    });
    expect(presidentTally.tallies['775031989']).toEqual({
      id: presidentContest.candidates.find((c) => c.id === '775031989')!.id,
      name: presidentContest.candidates.find((c) => c.id === '775031989')!.name,
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
    compressedTally[0] = [
      5, 4, 20, 3, 2, 2, 1, 1, 2,
    ] as CandidateContestCompressedTally;
    const presidentContest = election.contests.find(
      (contest) => contest.id === 'president'
    );
    assert(presidentContest?.type === 'candidate');
    const tally = readCompressedTally(
      election,
      encodeCompressedTally(compressedTally)
    );
    const presidentTally = tally['president'];
    assert(presidentTally);
    expect(presidentTally.ballots).toEqual(20);
    expect(presidentTally.undervotes).toEqual(5);
    expect(presidentTally.overvotes).toEqual(4);
    assert(presidentTally.contestType === 'candidate');
    expect(Object.keys(presidentTally.tallies)).toHaveLength(
      presidentContest.candidates.length
    );
    expect(presidentTally.tallies['barchi-hallaren']).toEqual({
      id: presidentContest.candidates.find((c) => c.id === 'barchi-hallaren')!
        .id,
      name: presidentContest.candidates.find((c) => c.id === 'barchi-hallaren')!
        .name,
      tally: 3,
    });
    expect(presidentTally.tallies['cramer-vuocolo']).toEqual({
      id: presidentContest.candidates.find((c) => c.id === 'cramer-vuocolo')!
        .id,
      name: presidentContest.candidates.find((c) => c.id === 'cramer-vuocolo')!
        .name,
      tally: 2,
    });
    expect(presidentTally.tallies['court-blumhardt']).toEqual({
      id: presidentContest.candidates.find((c) => c.id === 'court-blumhardt')!
        .id,
      name: presidentContest.candidates.find((c) => c.id === 'court-blumhardt')!
        .name,
      tally: 2,
    });
    expect(presidentTally.tallies['boone-lian']).toEqual({
      id: presidentContest.candidates.find((c) => c.id === 'boone-lian')!.id,
      name: presidentContest.candidates.find((c) => c.id === 'boone-lian')!
        .name,
      tally: 1,
    });
    expect(presidentTally.tallies['hildebrand-garritty']).toEqual({
      id: presidentContest.candidates.find(
        (c) => c.id === 'hildebrand-garritty'
      )!.id,
      name: presidentContest.candidates.find(
        (c) => c.id === 'hildebrand-garritty'
      )!.name,
      tally: 1,
    });
    expect(presidentTally.tallies['patterson-lariviere']).toEqual({
      id: presidentContest.candidates.find(
        (c) => c.id === 'patterson-lariviere'
      )!.id,
      name: presidentContest.candidates.find(
        (c) => c.id === 'patterson-lariviere'
      )!.name,
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
      encodeCompressedTally(compressedTally)
    );
    const yesNoTally = tally['750000017'];
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
    cardCounts: {
      bmd: 0,
      hmpb: [],
    },
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

  const compressedTally = compressAndEncodeTally(election, expectedTally);
  const decompressedTally = readCompressedTally(election, compressedTally);

  // using toMatchObject because decompressed contains extra attributes
  expect(decompressedTally).toMatchObject(expectedTally.contestResults);
});
