import {
  CandidateContest,
  CastVoteRecord,
  ContestOptionTally,
  Dictionary,
  PartyIdSchema,
  Tally,
  unsafeParse,
  VotingMethod,
  writeInCandidate,
} from '@votingworks/types';
import {
  electionMultiPartyPrimaryFixtures,
  electionSampleDefinition,
  electionWithMsEitherNeitherFixtures,
} from '@votingworks/fixtures';
import { getZeroCompressedTally } from '@votingworks/test-utils';

import { find, assert } from '@votingworks/basics';
import {
  compressTally,
  readCompressedTally,
  getTallyIdentifier,
} from './compressed_tallies';

import {
  calculateTallyForCastVoteRecords,
  filterTallyContestsByParty,
} from './votes';

describe('compressTally', () => {
  test('compressTally returns empty tally when no contest tallies provided', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.electionDefinition.election;
    const emptyTally: Tally = {
      numberOfBallotsCounted: 0,
      castVoteRecords: new Set<CastVoteRecord>(),
      contestTallies: {},
      ballotCountsByVotingMethod: {},
    };
    const compressedTally = compressTally(electionEitherNeither, emptyTally);
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
      electionWithMsEitherNeitherFixtures.electionDefinition.election;
    const emptyTally = calculateTallyForCastVoteRecords(
      electionEitherNeither,
      new Set()
    );
    const presidentContest = find(
      electionEitherNeither.contests,
      (c): c is CandidateContest =>
        c.type === 'candidate' && c.id === '775020876'
    );
    const candidateTallies: Dictionary<ContestOptionTally> = {};
    for (const [idx, candidate] of presidentContest.candidates.entries()) {
      candidateTallies[candidate.id] = {
        option: candidate,
        tally: idx * 2,
      };
    }
    candidateTallies[writeInCandidate.id] = {
      option: writeInCandidate,
      tally: 5,
    };
    const tallyWithPresidentTallies: Tally = {
      ...emptyTally,
      contestTallies: {
        ...emptyTally.contestTallies,
        '775020876': {
          contest: presidentContest,
          tallies: candidateTallies,
          metadata: {
            undervotes: 5,
            overvotes: 4,
            ballots: 20,
          },
        },
      },
    };
    const compressedTally = compressTally(
      electionEitherNeither,
      tallyWithPresidentTallies
    );
    expect(compressedTally).toHaveLength(electionEitherNeither.contests.length);
    expect(compressedTally[0]).toStrictEqual([5, 4, 20, 0, 2, 4, 5]);
  });

  test('compressTally compresses a yes no tally properly', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.electionDefinition.election;
    const emptyTally = calculateTallyForCastVoteRecords(
      electionEitherNeither,
      new Set()
    );
    const yesNoContestIdx = electionEitherNeither.contests.findIndex(
      (contest) => contest.id === '750000017'
    );
    const yesNoContest = electionEitherNeither.contests[yesNoContestIdx];
    assert(yesNoContest?.type === 'yesno');
    const optionTallies: Dictionary<ContestOptionTally> = {
      yes: { option: ['yes'], tally: 7 },
      no: { option: ['no'], tally: 9 },
    };
    const tallyWithYesNoTallies: Tally = {
      ...emptyTally,
      contestTallies: {
        ...emptyTally.contestTallies,
        '750000017': {
          contest: yesNoContest,
          tallies: optionTallies,
          metadata: {
            undervotes: 1,
            overvotes: 3,
            ballots: 20,
          },
        },
      },
    };
    const compressedTally = compressTally(
      electionEitherNeither,
      tallyWithYesNoTallies
    );
    expect(compressedTally).toHaveLength(electionEitherNeither.contests.length);
    expect(compressedTally[yesNoContestIdx]).toStrictEqual([1, 3, 20, 7, 9]);
  });
});

describe('readCompressTally', () => {
  test('reads a empty tally as expected', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.electionDefinition.election;
    const zeroTally = getZeroCompressedTally(electionEitherNeither);
    const tally = readCompressedTally(electionEitherNeither, zeroTally, [0, 0]);
    expect(tally.numberOfBallotsCounted).toEqual(0);
    // Check that all tallies are 0
    for (const contestTally of Object.values(tally.contestTallies)) {
      assert(contestTally);
      expect(contestTally.metadata).toStrictEqual({
        ballots: 0,
        undervotes: 0,
        overvotes: 0,
      });
      for (const optionTally of Object.values(contestTally.tallies)) {
        assert(optionTally);
        expect(optionTally.tally).toEqual(0);
      }
    }

    // Check that all other data in the tally was constructed properly.
    const expectedEmptyTally = calculateTallyForCastVoteRecords(
      electionEitherNeither,
      new Set()
    );
    expect(tally.contestTallies).toStrictEqual(
      expectedEmptyTally.contestTallies
    );
  });

  test('reads a candidate tally with write ins as expected', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.electionDefinition.election;
    const compressedTally = getZeroCompressedTally(electionEitherNeither);
    compressedTally[0] = [5, 4, 20, 0, 2, 4, 5];
    const presidentContest = electionEitherNeither.contests.find(
      (contest) => contest.id === '775020876'
    );
    assert(presidentContest?.type === 'candidate');
    const votingMethodData: Tally['ballotCountsByVotingMethod'] = {
      [VotingMethod.Absentee]: 5,
      [VotingMethod.Precinct]: 15,
    };
    const tally = readCompressedTally(
      electionEitherNeither,
      compressedTally,
      [15, 5]
    );
    expect(tally.numberOfBallotsCounted).toEqual(20);
    expect(tally.ballotCountsByVotingMethod).toStrictEqual(votingMethodData);
    const presidentTally = tally.contestTallies['775020876'];
    assert(presidentTally);
    expect(presidentTally.contest).toEqual(presidentContest);
    expect(presidentTally.metadata).toStrictEqual({
      ballots: 20,
      undervotes: 5,
      overvotes: 4,
    });
    expect(Object.keys(presidentTally.tallies)).toHaveLength(
      presidentContest.candidates.length + 1
    ); // 1 more then the number of candidates to include write ins
    expect(presidentTally.tallies['775031988']).toStrictEqual({
      option: presidentContest.candidates.find((c) => c.id === '775031988'),
      tally: 0,
    });
    expect(presidentTally.tallies['775031987']).toStrictEqual({
      option: presidentContest.candidates.find((c) => c.id === '775031987'),
      tally: 2,
    });
    expect(presidentTally.tallies['775031989']).toStrictEqual({
      option: presidentContest.candidates.find((c) => c.id === '775031989'),
      tally: 4,
    });
    expect(presidentTally.tallies[writeInCandidate.id]).toStrictEqual({
      option: writeInCandidate,
      tally: 5,
    });
  });

  test('reads a candidate tally without write ins as expected', () => {
    const compressedTally = getZeroCompressedTally(
      electionSampleDefinition.election
    );
    compressedTally[0] = [5, 4, 20, 3, 2, 2, 1, 1, 2, 50];
    const presidentContest = electionSampleDefinition.election.contests.find(
      (contest) => contest.id === 'president'
    );
    assert(presidentContest?.type === 'candidate');
    const votingMethodData: Tally['ballotCountsByVotingMethod'] = {
      [VotingMethod.Absentee]: 5,
      [VotingMethod.Precinct]: 15,
    };
    const tally = readCompressedTally(
      electionSampleDefinition.election,
      compressedTally,
      [15, 5]
    );
    expect(tally.numberOfBallotsCounted).toEqual(20);
    expect(tally.ballotCountsByVotingMethod).toStrictEqual(votingMethodData);
    const presidentTally = tally.contestTallies['president'];
    assert(presidentTally);
    expect(presidentTally.contest).toEqual(presidentContest);
    expect(presidentTally.metadata).toStrictEqual({
      ballots: 20,
      undervotes: 5,
      overvotes: 4,
    });
    expect(Object.keys(presidentTally.tallies)).toHaveLength(
      presidentContest.candidates.length
    );
    expect(presidentTally.tallies['barchi-hallaren']).toStrictEqual({
      option: presidentContest.candidates.find(
        (c) => c.id === 'barchi-hallaren'
      ),
      tally: 3,
    });
    expect(presidentTally.tallies['cramer-vuocolo']).toStrictEqual({
      option: presidentContest.candidates.find(
        (c) => c.id === 'cramer-vuocolo'
      ),
      tally: 2,
    });
    expect(presidentTally.tallies['court-blumhardt']).toStrictEqual({
      option: presidentContest.candidates.find(
        (c) => c.id === 'court-blumhardt'
      ),
      tally: 2,
    });
    expect(presidentTally.tallies['boone-lian']).toStrictEqual({
      option: presidentContest.candidates.find((c) => c.id === 'boone-lian'),
      tally: 1,
    });
    expect(presidentTally.tallies['hildebrand-garritty']).toStrictEqual({
      option: presidentContest.candidates.find(
        (c) => c.id === 'hildebrand-garritty'
      ),
      tally: 1,
    });
    expect(presidentTally.tallies['patterson-lariviere']).toStrictEqual({
      option: presidentContest.candidates.find(
        (c) => c.id === 'patterson-lariviere'
      ),
      tally: 2,
    });
    expect(Object.keys(presidentTally.tallies)).not.toContain(
      writeInCandidate.id
    );
  });

  test('reads a yes no tally as expected', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherFixtures.electionDefinition.election;
    const compressedTally = getZeroCompressedTally(electionEitherNeither);
    const yesNoContestIdx = electionEitherNeither.contests.findIndex(
      (contest) => contest.id === '750000017'
    );
    compressedTally[yesNoContestIdx] = [6, 4, 20, 3, 7];
    const yesNoContest = electionEitherNeither.contests[yesNoContestIdx];
    assert(yesNoContest?.type === 'yesno');
    const votingMethodData: Tally['ballotCountsByVotingMethod'] = {
      [VotingMethod.Absentee]: 15,
      [VotingMethod.Precinct]: 5,
    };
    const tally = readCompressedTally(
      electionEitherNeither,
      compressedTally,
      [5, 15]
    );
    expect(tally.numberOfBallotsCounted).toEqual(20);
    expect(tally.ballotCountsByVotingMethod).toStrictEqual(votingMethodData);
    const yesNoTally = tally.contestTallies['750000017'];
    assert(yesNoTally);
    expect(yesNoTally.contest).toEqual(yesNoContest);
    expect(yesNoTally.metadata).toStrictEqual({
      ballots: 20,
      undervotes: 6,
      overvotes: 4,
    });
    expect(yesNoTally.tallies).toStrictEqual({
      yes: { option: ['yes'], tally: 3 },
      no: { option: ['no'], tally: 7 },
    });
  });
});

test('primary tally can compress and be read back and end with the original tally', () => {
  const castVoteRecordsContent = electionMultiPartyPrimaryFixtures.cvrData;
  const lines = castVoteRecordsContent.split('\n');
  const castVoteRecords = lines.flatMap((line) =>
    line.length > 0 ? (JSON.parse(line) as CastVoteRecord) : []
  );
  const electionMultiParty =
    electionMultiPartyPrimaryFixtures.electionDefinition.election;

  const expectedTally = calculateTallyForCastVoteRecords(
    electionMultiParty,
    new Set(castVoteRecords)
  );
  const compressedTally = compressTally(electionMultiParty, expectedTally);

  const party0 = unsafeParse(PartyIdSchema, '0');
  const expectedLibertyTally = filterTallyContestsByParty(
    electionMultiParty,
    calculateTallyForCastVoteRecords(
      electionMultiParty,
      new Set(
        castVoteRecords.filter((cvr) =>
          ['1L', '2L'].includes(cvr._ballotStyleId)
        )
      )
    ),
    party0
  );
  // can read for a specific party id
  const processedLibertyTally = readCompressedTally(
    electionMultiParty,
    compressedTally,
    [
      expectedLibertyTally.ballotCountsByVotingMethod[VotingMethod.Precinct] ??
        0,
      expectedLibertyTally.ballotCountsByVotingMethod[VotingMethod.Absentee] ??
        0,
    ],
    party0
  );
  delete expectedLibertyTally.ballotCountsByVotingMethod[VotingMethod.Unknown];
  expect(processedLibertyTally.ballotCountsByVotingMethod).toStrictEqual(
    expectedLibertyTally.ballotCountsByVotingMethod
  );
  expect(processedLibertyTally.numberOfBallotsCounted).toStrictEqual(
    342 // this is different then the total number of ballots as unknown ballots are ignored
  );
  expect(processedLibertyTally.contestTallies).toStrictEqual(
    expectedLibertyTally.contestTallies
  );
});

describe('getTallyIdentifier', () => {
  const party1 = unsafeParse(PartyIdSchema, 'party1');

  test('returns expected identifier with a party and precinct', () => {
    expect(getTallyIdentifier(party1, 'precinct1')).toEqual('party1,precinct1');
  });

  test('returns expected identifier with no party and a precinct', () => {
    expect(getTallyIdentifier(undefined, 'precinct1')).toEqual(
      'undefined,precinct1'
    );
  });

  test('returns expected identifier with a party and no precinct', () => {
    expect(getTallyIdentifier(party1)).toEqual('party1,__ALL_PRECINCTS');
  });

  test('returns expected identifier with no party and no precinct', () => {
    expect(getTallyIdentifier()).toEqual('undefined,__ALL_PRECINCTS');
  });
});
