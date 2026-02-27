import { describe, expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  CandidateContest,
  CandidateContestCompressedTally,
  CompressedTally,
  Election,
  PrecinctId,
  PrecinctSelection,
  Tabulation,
} from '@votingworks/types';
import {
  electionWithMsEitherNeitherFixtures,
  readElectionGeneral,
  readElectionTwoPartyPrimary,
} from '@votingworks/fixtures';
import { find, assert, assertDefined } from '@votingworks/basics';
import fc from 'fast-check';
import {
  compressAndEncodeTally,
  compressTally,
  decodeCompressedTally,
  encodeCompressedTally,
  decodeAndReadCompressedTally,
  decodeAndReadPerPrecinctCompressedTally,
  encodePrecinctBitmap,
  encodeTallyEntries,
  splitEncodedTallyByPrecinct,
  getPrecinctIdsFromBitmap,
} from './compressed_tallies';
import {
  buildElectionResultsFixture,
  getEmptyElectionResults,
} from './tabulation';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '../precinct_selection';

function getZeroCompressedTally(
  election: Election,
  precinctSelection: PrecinctSelection = ALL_PRECINCTS_SELECTION
): CompressedTally {
  const mockResults = buildElectionResultsFixture({
    election,
    cardCounts: {
      bmd: [],
      hmpb: [],
    },
    contestResultsSummaries: {},
    includeGenericWriteIn: true,
  });
  return compressTally(election, mockResults, precinctSelection);
}

describe('V0 compressTally', () => {
  test('compressTally returns empty tally when no contest tallies provided', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();
    const compressedTallies = encodeCompressedTally(
      compressTally(
        electionEitherNeither,
        getEmptyElectionResults(electionEitherNeither),
        ALL_PRECINCTS_SELECTION
      ),
      1
    );
    expect(compressedTallies).toHaveLength(1);
    const [compressedTally] = compressedTallies;
    assert(typeof compressedTally === 'string');
    // The compressed tally should be a long string of A's since all counts are 0
    expect(compressedTally).toMatchInlineSnapshot(
      `"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"`
    );
    const decodedCompressedTally = decodeCompressedTally(
      compressedTally,
      ALL_PRECINCTS_SELECTION,
      electionEitherNeither
    );
    // There should be a compressed tally for each contest
    expect(decodedCompressedTally.length).toEqual(
      electionEitherNeither.contests.length
    );
    // A candidate contest compressed tally should be all zeros
    expect(decodedCompressedTally[0]).toStrictEqual([0, 0, 0, 0, 0, 0, 0]);

    // Compress for a single precinct
    const compressedTalliesSinglePrecinct = encodeCompressedTally(
      compressTally(
        electionEitherNeither,
        getEmptyElectionResults(electionEitherNeither),
        singlePrecinctSelectionFor('6522')
      ),
      1
    );
    expect(compressedTalliesSinglePrecinct).toHaveLength(1);
    const [compressedTallySinglePrecinct] = compressedTalliesSinglePrecinct;
    assert(typeof compressedTallySinglePrecinct === 'string');
    expect(compressedTallySinglePrecinct).toMatchInlineSnapshot(
      `"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"`
    );
    const decodedCompressedTallySinglePrecinct = decodeCompressedTally(
      compressedTallySinglePrecinct,
      singlePrecinctSelectionFor('6522'),
      electionEitherNeither
    );
    // There should be a compressed tally for each contest in the precinct
    expect(decodedCompressedTallySinglePrecinct.length).toEqual(10);

    // A yes no contest compressed tally should be all zeros
    const yesNoContestIdx = electionEitherNeither.contests.findIndex(
      (contest) => contest.id === '750000017'
    );
    expect(decodedCompressedTally[yesNoContestIdx]).toStrictEqual([
      0, 0, 0, 0, 0,
    ]);
  });

  test('compressTally can break a tally into arbitrary parts', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();
    const results = getEmptyElectionResults(electionEitherNeither);

    const compressedTalliesSinglePart = encodeCompressedTally(
      compressTally(electionEitherNeither, results, ALL_PRECINCTS_SELECTION),
      1
    );
    expect(compressedTalliesSinglePart).toHaveLength(1);
    const [compressedTallySinglePart] = compressedTalliesSinglePart;
    assert(typeof compressedTallySinglePart === 'string');

    fc.assert(
      fc.property(fc.integer({ min: 1, max: 25 }), (numPages) => {
        const compressedTallies = encodeCompressedTally(
          compressTally(
            electionEitherNeither,
            results,
            ALL_PRECINCTS_SELECTION
          ),
          numPages
        );
        expect(compressedTallies).toHaveLength(numPages);

        // The broken up tallies should combine to equal the single part tally
        expect(compressedTallySinglePart).toEqual(
          assertDefined(
            Buffer.concat(
              compressedTallies.map((compressedTally) =>
                Buffer.from(compressedTally, 'base64url')
              )
            ).toString('base64url')
          )
        );
      })
    );
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
        bmd: [20],
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
    const compressedTallies = encodeCompressedTally(
      compressTally(
        electionEitherNeither,
        resultsWithPresidentTallies,
        ALL_PRECINCTS_SELECTION
      ),
      1
    );
    expect(compressedTallies).toHaveLength(1);
    const [compressedTally] = compressedTallies;
    assert(typeof compressedTally === 'string');
    expect(compressedTally).toMatchInlineSnapshot(
      `"AAAFAAQAFAAAAAIABAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"`
    );
    const decodedCompressedTally = decodeCompressedTally(
      compressedTally,
      ALL_PRECINCTS_SELECTION,
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
        bmd: [20],
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

    const compressedTallies = encodeCompressedTally(
      compressTally(
        electionEitherNeither,
        resultsWithYesNoTallies,
        ALL_PRECINCTS_SELECTION
      ),
      1
    );
    expect(compressedTallies).toHaveLength(1);
    const [compressedTally] = compressedTallies;
    assert(typeof compressedTally === 'string');
    expect(compressedTally).toMatchInlineSnapshot(
      `"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQADABQABwAJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"`
    );
    const decodedCompressedTally = decodeCompressedTally(
      compressedTally,
      ALL_PRECINCTS_SELECTION,
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

describe('V0 readCompressTally', () => {
  test('reads a empty tally as expected', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();
    const zeroTally = getZeroCompressedTally(electionEitherNeither);
    const tally = decodeAndReadCompressedTally({
      election: electionEitherNeither,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      encodedTally: assertDefined(encodeCompressedTally(zeroTally, 1)[0]),
    });
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
    const tally = decodeAndReadCompressedTally({
      election: electionEitherNeither,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      encodedTally: assertDefined(encodeCompressedTally(compressedTally, 1)[0]),
    });
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
    const tally = decodeAndReadCompressedTally({
      election,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      encodedTally: assertDefined(encodeCompressedTally(compressedTally, 1)[0]),
    });
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
    const tally = decodeAndReadCompressedTally({
      election: electionEitherNeither,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      encodedTally: assertDefined(encodeCompressedTally(compressedTally, 1)[0]),
    });
    const yesNoTally = tally['750000017'];
    assert(yesNoTally?.contestType === 'yesno');
    expect(yesNoTally.ballots).toEqual(20);
    expect(yesNoTally.undervotes).toEqual(6);
    expect(yesNoTally.overvotes).toEqual(4);
    expect(yesNoTally.yesTally).toEqual(3);
    expect(yesNoTally.noTally).toEqual(7);
  });
});

test('V0 primary tally can compress and be read back and end with the original tally', () => {
  const election = readElectionTwoPartyPrimary();
  const expectedTally = buildElectionResultsFixture({
    election,
    cardCounts: {
      bmd: [],
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

  const compressedTallies = encodeCompressedTally(
    compressTally(election, expectedTally, ALL_PRECINCTS_SELECTION),
    1
  );
  expect(compressedTallies).toHaveLength(1);
  const [compressedTally] = compressedTallies;
  assert(typeof compressedTally === 'string');
  const decompressedTally = decodeAndReadCompressedTally({
    election,
    precinctSelection: ALL_PRECINCTS_SELECTION,
    encodedTally: compressedTally,
  });

  // using toMatchObject because decompressed contains extra attributes
  expect(decompressedTally).toMatchObject(expectedTally.contestResults);
});

test('V0 compresses and decompresses tally for a single precinct', () => {
  const electionEitherNeither =
    electionWithMsEitherNeitherFixtures.readElection();
  const singlePrecinctSelection = singlePrecinctSelectionFor('6522');
  const singlePrecinctSelection2 = singlePrecinctSelectionFor('6525');

  const mockResults = buildElectionResultsFixture({
    election: electionEitherNeither,
    cardCounts: {
      bmd: [10],
      hmpb: [],
    },
    contestResultsSummaries: {},
    includeGenericWriteIn: true,
  });

  const compressedTally = compressTally(
    electionEitherNeither,
    mockResults,
    singlePrecinctSelection
  );
  const compressedTallyPrecinct2 = compressTally(
    electionEitherNeither,
    mockResults,
    singlePrecinctSelection2
  );
  expect(compressedTally).toHaveLength(10); // There are 14 contests in this election but only 10 for the precinct
  expect(compressedTallyPrecinct2).toHaveLength(9); // There are 14 contests in this election but only 9 for the precinct
  const encodedTally = encodeCompressedTally(compressedTally, 1);
  const encodedTallyPrecinct2 = encodeCompressedTally(
    compressedTallyPrecinct2,
    1
  );
  const decodedTally = decodeAndReadCompressedTally({
    election: electionEitherNeither,
    precinctSelection: singlePrecinctSelection,
    encodedTally: assertDefined(encodedTally[0]),
  });
  const decodedTallyPrecinct2 = decodeAndReadCompressedTally({
    election: electionEitherNeither,
    precinctSelection: singlePrecinctSelection2,
    encodedTally: assertDefined(encodedTallyPrecinct2[0]),
  });

  // Verify that the contest results received are for the correct precincts contests
  expect(Object.keys(decodedTally)).toMatchInlineSnapshot(`
      [
        "750000015",
        "750000016",
        "750000017",
        "750000018",
        "775020870",
        "775020872",
        "775020876",
        "775020877",
        "775020903",
        "775020904",
      ]
    `);
  expect(Object.keys(decodedTallyPrecinct2)).toMatchInlineSnapshot(`
    [
      "750000015",
      "750000016",
      "750000017",
      "750000018",
      "775020870",
      "775020872",
      "775020876",
      "775020877",
      "775020902",
    ]
  `);
});

describe('bitmap format', () => {
  test('bitmap round-trip: encode per-precinct, decode and verify aggregate', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();

    // Build results for two precincts with different data
    const precinct1Results = buildElectionResultsFixture({
      election: electionEitherNeither,
      cardCounts: {
        bmd: [10],
        hmpb: [],
      },
      contestResultsSummaries: {
        '775020876': {
          type: 'candidate',
          undervotes: 2,
          overvotes: 1,
          ballots: 10,
          officialOptionTallies: {
            '775031988': 3,
            '775031987': 2,
            '775031989': 2,
          },
        },
      },
      includeGenericWriteIn: true,
    });

    const precinct2Results = buildElectionResultsFixture({
      election: electionEitherNeither,
      cardCounts: {
        bmd: [15],
        hmpb: [],
      },
      contestResultsSummaries: {
        '775020876': {
          type: 'candidate',
          undervotes: 3,
          overvotes: 2,
          ballots: 15,
          officialOptionTallies: {
            '775031988': 5,
            '775031987': 3,
            '775031989': 2,
          },
        },
      },
      includeGenericWriteIn: true,
    });

    const resultsByPrecinct: Partial<
      Record<PrecinctId, Tabulation.ElectionResults>
    > = {
      '6522': precinct1Results,
      '6525': precinct2Results,
    };

    const encoded = compressAndEncodeTally({
      election: electionEitherNeither,
      resultsByPrecinct,
      numPages: 1,
    });
    expect(encoded).toHaveLength(1);

    const aggregated = decodeAndReadCompressedTally({
      election: electionEitherNeither,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      encodedTally: assertDefined(encoded[0]),
    });

    // The president contest should have aggregated tallies
    const presidentTally = aggregated['775020876'];
    assert(presidentTally);
    assert(presidentTally.contestType === 'candidate');
    expect(presidentTally.ballots).toEqual(25);
    expect(presidentTally.undervotes).toEqual(5);
    expect(presidentTally.overvotes).toEqual(3);
    expect(presidentTally.tallies['775031988']?.tally).toEqual(8);
    expect(presidentTally.tallies['775031987']?.tally).toEqual(5);
    expect(presidentTally.tallies['775031989']?.tally).toEqual(4);
  });

  test('bitmap per-precinct decode: verify breakdown', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();

    const precinct1Results = buildElectionResultsFixture({
      election: electionEitherNeither,
      cardCounts: {
        bmd: [10],
        hmpb: [],
      },
      contestResultsSummaries: {
        '750000017': {
          type: 'yesno',
          ballots: 10,
          undervotes: 1,
          overvotes: 2,
          yesTally: 4,
          noTally: 3,
        },
      },
      includeGenericWriteIn: true,
    });

    const precinct2Results = buildElectionResultsFixture({
      election: electionEitherNeither,
      cardCounts: {
        bmd: [20],
        hmpb: [],
      },
      contestResultsSummaries: {
        '750000017': {
          type: 'yesno',
          ballots: 20,
          undervotes: 2,
          overvotes: 3,
          yesTally: 8,
          noTally: 7,
        },
      },
      includeGenericWriteIn: true,
    });

    const resultsByPrecinct: Partial<
      Record<PrecinctId, Tabulation.ElectionResults>
    > = {
      '6522': precinct1Results,
      '6525': precinct2Results,
    };

    const encoded = compressAndEncodeTally({
      election: electionEitherNeither,
      resultsByPrecinct,
      numPages: 1,
    });

    const perPrecinct = decodeAndReadPerPrecinctCompressedTally({
      election: electionEitherNeither,
      encodedTally: assertDefined(encoded[0]),
    });

    expect(Object.keys(perPrecinct)).toEqual(
      expect.arrayContaining(['6522', '6525'])
    );

    // Check precinct 1 yes/no contest
    const p1YesNo = perPrecinct['6522']?.['750000017'];
    assert(p1YesNo?.contestType === 'yesno');
    expect(p1YesNo.ballots).toEqual(10);
    expect(p1YesNo.undervotes).toEqual(1);
    expect(p1YesNo.overvotes).toEqual(2);
    expect(p1YesNo.yesTally).toEqual(4);
    expect(p1YesNo.noTally).toEqual(3);

    // Check precinct 2 yes/no contest
    const p2YesNo = perPrecinct['6525']?.['750000017'];
    assert(p2YesNo?.contestType === 'yesno');
    expect(p2YesNo.ballots).toEqual(20);
    expect(p2YesNo.undervotes).toEqual(2);
    expect(p2YesNo.overvotes).toEqual(3);
    expect(p2YesNo.yesTally).toEqual(8);
    expect(p2YesNo.noTally).toEqual(7);
  });

  test('single-precinct: bitmap with 1 bit set', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();

    const precinctResults = buildElectionResultsFixture({
      election: electionEitherNeither,
      cardCounts: {
        bmd: [5],
        hmpb: [],
      },
      contestResultsSummaries: {},
      includeGenericWriteIn: true,
    });

    const resultsByPrecinct: Partial<
      Record<PrecinctId, Tabulation.ElectionResults>
    > = {
      '6522': precinctResults,
    };

    const encoded = compressAndEncodeTally({
      election: electionEitherNeither,
      resultsByPrecinct,
      numPages: 1,
    });

    const perPrecinct = decodeAndReadPerPrecinctCompressedTally({
      election: electionEitherNeither,
      encodedTally: assertDefined(encoded[0]),
    });

    expect(Object.keys(perPrecinct)).toEqual(['6522']);

    // Verify contests are only those belonging to precinct 6522
    const precinctContestIds = Object.keys(assertDefined(perPrecinct['6522']));
    expect(precinctContestIds).toMatchInlineSnapshot(`
      [
        "750000015",
        "750000016",
        "750000017",
        "750000018",
        "775020870",
        "775020872",
        "775020876",
        "775020877",
        "775020903",
        "775020904",
      ]
    `);
  });

  test('sparse data: many precincts, few with data', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();

    // Only one precinct has data out of all precincts
    const precinctResults = buildElectionResultsFixture({
      election: electionEitherNeither,
      cardCounts: {
        bmd: [1],
        hmpb: [],
      },
      contestResultsSummaries: {},
      includeGenericWriteIn: true,
    });

    const lastPrecinct =
      electionEitherNeither.precincts[
        electionEitherNeither.precincts.length - 1
      ];
    assert(lastPrecinct !== undefined);

    const resultsByPrecinct: Partial<
      Record<PrecinctId, Tabulation.ElectionResults>
    > = {
      [lastPrecinct.id]: precinctResults,
    };

    const encodedSparse = compressAndEncodeTally({
      election: electionEitherNeither,
      resultsByPrecinct,
      numPages: 1,
    });

    // Compare with encoding all precincts with data
    const allPrecinctResults: Record<string, Tabulation.ElectionResults> = {};
    for (const precinct of electionEitherNeither.precincts) {
      allPrecinctResults[precinct.id] = buildElectionResultsFixture({
        election: electionEitherNeither,
        cardCounts: {
          bmd: [1],
          hmpb: [],
        },
        contestResultsSummaries: {},
        includeGenericWriteIn: true,
      });
    }
    const encodedAll = compressAndEncodeTally({
      election: electionEitherNeither,
      resultsByPrecinct: allPrecinctResults,
      numPages: 1,
    });

    // Sparse encoding should be significantly smaller
    const sparseSize = Buffer.from(
      assertDefined(encodedSparse[0]),
      'base64url'
    ).byteLength;
    const allSize = Buffer.from(
      assertDefined(encodedAll[0]),
      'base64url'
    ).byteLength;
    expect(sparseSize).toBeLessThan(allSize);

    // Round-trip verification
    const perPrecinct = decodeAndReadPerPrecinctCompressedTally({
      election: electionEitherNeither,
      encodedTally: assertDefined(encodedSparse[0]),
    });
    expect(Object.keys(perPrecinct)).toEqual([lastPrecinct.id]);
  });

  test('empty resultsByPrecinct produces minimal encoding', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();

    const encoded = compressAndEncodeTally({
      election: electionEitherNeither,
      resultsByPrecinct: {},
      numPages: 1,
    });

    // Empty bitmap has first word = 0, which looks like V0 to auto-detection
    // and is rejected by per-precinct decode
    expect(() =>
      decodeAndReadPerPrecinctCompressedTally({
        election: electionEitherNeither,
        encodedTally: assertDefined(encoded[0]),
      })
    ).toThrow('Per-precinct decode requires bitmap format, got V0 legacy data');
  });

  test('can break into multiple pages', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();

    const precinctResults = buildElectionResultsFixture({
      election: electionEitherNeither,
      cardCounts: {
        bmd: [10],
        hmpb: [],
      },
      contestResultsSummaries: {},
      includeGenericWriteIn: true,
    });

    const resultsByPrecinct: Partial<
      Record<PrecinctId, Tabulation.ElectionResults>
    > = {
      '6522': precinctResults,
      '6525': precinctResults,
    };

    const singlePage = compressAndEncodeTally({
      election: electionEitherNeither,
      resultsByPrecinct,
      numPages: 1,
    });

    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (numPages) => {
        const multiPage = compressAndEncodeTally({
          election: electionEitherNeither,
          resultsByPrecinct,
          numPages,
        });
        expect(multiPage).toHaveLength(numPages);

        // Combined pages should equal the single page
        const combinedBuffer = Buffer.concat(
          multiPage.map((page) => Buffer.from(page, 'base64url'))
        );
        const singleBuffer = Buffer.from(
          assertDefined(singlePage[0]),
          'base64url'
        );
        expect(combinedBuffer.toString('base64url')).toEqual(
          singleBuffer.toString('base64url')
        );
      })
    );
  });

  test('decodeAndReadPerPrecinctCompressedTally rejects V0 data', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();
    const zeroTally = getZeroCompressedTally(electionEitherNeither);
    const v0Encoded = assertDefined(encodeCompressedTally(zeroTally, 1)[0]);

    expect(() =>
      decodeAndReadPerPrecinctCompressedTally({
        election: electionEitherNeither,
        encodedTally: v0Encoded,
      })
    ).toThrow('Per-precinct decode requires bitmap format, got V0 legacy data');
  });
});

describe('tally format auto-detection', () => {
  test('auto-detects V0 format', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();
    const zeroTally = getZeroCompressedTally(electionEitherNeither);
    const v0Encoded = assertDefined(encodeCompressedTally(zeroTally, 1)[0]);

    const result = decodeAndReadCompressedTally({
      election: electionEitherNeither,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      encodedTally: v0Encoded,
    });

    for (const contestTally of Object.values(result)) {
      assert(contestTally);
      expect(contestTally.ballots).toEqual(0);
    }
  });

  test('auto-detects bitmap format', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();

    const precinctResults = buildElectionResultsFixture({
      election: electionEitherNeither,
      cardCounts: { bmd: [10], hmpb: [] },
      contestResultsSummaries: {
        '775020876': {
          type: 'candidate',
          undervotes: 2,
          overvotes: 1,
          ballots: 10,
          officialOptionTallies: {
            '775031988': 3,
            '775031987': 2,
            '775031989': 2,
          },
        },
      },
      includeGenericWriteIn: true,
    });

    const resultsByPrecinct: Partial<
      Record<PrecinctId, Tabulation.ElectionResults>
    > = {
      '6522': precinctResults,
    };

    const encoded = compressAndEncodeTally({
      election: electionEitherNeither,
      resultsByPrecinct,
      numPages: 1,
    });

    const result = decodeAndReadCompressedTally({
      election: electionEitherNeither,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      encodedTally: assertDefined(encoded[0]),
    });

    const presidentTally = result['775020876'];
    assert(presidentTally);
    assert(presidentTally.contestType === 'candidate');
    expect(presidentTally.ballots).toEqual(10);
    expect(presidentTally.undervotes).toEqual(2);
    expect(presidentTally.overvotes).toEqual(1);
  });

  test('auto-detects bitmap format for per-precinct decode', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();

    const precinctResults = buildElectionResultsFixture({
      election: electionEitherNeither,
      cardCounts: { bmd: [5], hmpb: [] },
      contestResultsSummaries: {},
      includeGenericWriteIn: true,
    });

    const resultsByPrecinct: Partial<
      Record<PrecinctId, Tabulation.ElectionResults>
    > = {
      '6522': precinctResults,
    };

    const encoded = compressAndEncodeTally({
      election: electionEitherNeither,
      resultsByPrecinct,
      numPages: 1,
    });

    const perPrecinct = decodeAndReadPerPrecinctCompressedTally({
      election: electionEitherNeither,
      encodedTally: assertDefined(encoded[0]),
    });

    expect(Object.keys(perPrecinct)).toEqual(['6522']);
  });
});

describe('split bitmap/tally functions', () => {
  test('encodePrecinctBitmap returns a base64url string', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();

    const precinctResults = buildElectionResultsFixture({
      election: electionEitherNeither,
      cardCounts: { bmd: [5], hmpb: [] },
      contestResultsSummaries: {},
      includeGenericWriteIn: true,
    });

    const resultsByPrecinct: Partial<
      Record<PrecinctId, Tabulation.ElectionResults>
    > = {
      '6522': precinctResults,
    };

    const bitmap = encodePrecinctBitmap(
      electionEitherNeither,
      resultsByPrecinct
    );
    expect(typeof bitmap).toEqual('string');
    expect(bitmap.length).toBeGreaterThan(0);
    // Should be valid base64url
    expect(Buffer.from(bitmap, 'base64url').toString('base64url')).toEqual(
      bitmap
    );
  });

  test('encodeTallyEntries produces tally-only data without bitmap', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();

    const precinctResults = buildElectionResultsFixture({
      election: electionEitherNeither,
      cardCounts: { bmd: [5], hmpb: [] },
      contestResultsSummaries: {},
      includeGenericWriteIn: true,
    });

    const resultsByPrecinct: Partial<
      Record<PrecinctId, Tabulation.ElectionResults>
    > = {
      '6522': precinctResults,
    };

    const entries = encodeTallyEntries({
      election: electionEitherNeither,
      resultsByPrecinct,
      numPages: 1,
    });
    expect(entries).toHaveLength(1);
    expect(typeof entries[0]).toEqual('string');
  });

  test('splitEncodedTallyByPrecinct splits bitmap+tally into per-precinct v0 tallies', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();

    const precinct1Results = buildElectionResultsFixture({
      election: electionEitherNeither,
      cardCounts: { bmd: [10], hmpb: [] },
      contestResultsSummaries: {
        '775020876': {
          type: 'candidate',
          undervotes: 2,
          overvotes: 1,
          ballots: 10,
          officialOptionTallies: {
            '775031988': 3,
            '775031987': 2,
            '775031989': 2,
          },
        },
      },
      includeGenericWriteIn: true,
    });

    const precinct2Results = buildElectionResultsFixture({
      election: electionEitherNeither,
      cardCounts: { bmd: [15], hmpb: [] },
      contestResultsSummaries: {
        '775020876': {
          type: 'candidate',
          undervotes: 3,
          overvotes: 2,
          ballots: 15,
          officialOptionTallies: {
            '775031988': 5,
            '775031987': 3,
            '775031989': 2,
          },
        },
      },
      includeGenericWriteIn: true,
    });

    const resultsByPrecinct: Partial<
      Record<PrecinctId, Tabulation.ElectionResults>
    > = {
      '6522': precinct1Results,
      '6525': precinct2Results,
    };

    const bitmap = encodePrecinctBitmap(
      electionEitherNeither,
      resultsByPrecinct
    );
    const entries = encodeTallyEntries({
      election: electionEitherNeither,
      resultsByPrecinct,
      numPages: 1,
    });

    const precinctIds = getPrecinctIdsFromBitmap(electionEitherNeither, bitmap);
    expect(precinctIds).toEqual(['6522', '6525']);

    const perPrecinct = splitEncodedTallyByPrecinct(
      electionEitherNeither,
      precinctIds,
      assertDefined(entries[0])
    );

    expect(perPrecinct).toHaveLength(2);
    expect(perPrecinct.map((p) => p.precinctId)).toEqual(['6522', '6525']);

    // Each per-precinct tally should decode as v0 format
    const decoded1 = decodeAndReadCompressedTally({
      election: electionEitherNeither,
      precinctSelection: singlePrecinctSelectionFor('6522'),
      encodedTally: perPrecinct[0]!.encodedTally,
    });
    const president1 = decoded1['775020876'];
    assert(president1?.contestType === 'candidate');
    expect(president1.ballots).toEqual(10);
    expect(president1.undervotes).toEqual(2);
    expect(president1.overvotes).toEqual(1);
    expect(president1.tallies['775031988']?.tally).toEqual(3);

    const decoded2 = decodeAndReadCompressedTally({
      election: electionEitherNeither,
      precinctSelection: singlePrecinctSelectionFor('6525'),
      encodedTally: perPrecinct[1]!.encodedTally,
    });
    const president2 = decoded2['775020876'];
    assert(president2?.contestType === 'candidate');
    expect(president2.ballots).toEqual(15);
    expect(president2.undervotes).toEqual(3);
    expect(president2.overvotes).toEqual(2);
    expect(president2.tallies['775031988']?.tally).toEqual(5);
  });

  test('splitEncodedTallyByPrecinct works with multi-page tally entries', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.readElection();

    const precinctResults = buildElectionResultsFixture({
      election: electionEitherNeither,
      cardCounts: { bmd: [10], hmpb: [] },
      contestResultsSummaries: {},
      includeGenericWriteIn: true,
    });

    const resultsByPrecinct: Partial<
      Record<PrecinctId, Tabulation.ElectionResults>
    > = {
      '6522': precinctResults,
      '6525': precinctResults,
    };

    const bitmap = encodePrecinctBitmap(
      electionEitherNeither,
      resultsByPrecinct
    );

    const precinctIds = getPrecinctIdsFromBitmap(electionEitherNeither, bitmap);

    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), (numPages) => {
        const entries = encodeTallyEntries({
          election: electionEitherNeither,
          resultsByPrecinct,
          numPages,
        });
        expect(entries).toHaveLength(numPages);

        // Combine all pages
        const combinedTallyBuffer = Buffer.concat(
          entries.map((e) => Buffer.from(e, 'base64url'))
        );
        const combinedTallyEncoded = combinedTallyBuffer.toString('base64url');

        const perPrecinct = splitEncodedTallyByPrecinct(
          electionEitherNeither,
          precinctIds,
          combinedTallyEncoded
        );

        expect(perPrecinct).toHaveLength(2);
        expect(perPrecinct.map((p) => p.precinctId)).toEqual(['6522', '6525']);

        // Each per-precinct tally should decode without error
        for (const { precinctId, encodedTally } of perPrecinct) {
          const decoded = decodeAndReadCompressedTally({
            election: electionEitherNeither,
            precinctSelection: singlePrecinctSelectionFor(precinctId),
            encodedTally,
          });
          expect(Object.keys(decoded).length).toBeGreaterThan(0);
        }
      })
    );
  });
});
