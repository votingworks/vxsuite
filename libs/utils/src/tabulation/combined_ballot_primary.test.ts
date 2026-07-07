import { describe, expect, test } from 'vitest';
import {
  CandidateContest,
  PartyId,
  YesNoContest,
  Tabulation,
} from '@votingworks/types';
import {
  readElectionGeneral,
  readElectionCombinedBallotPrimary,
  readElectionTwoPartyPrimary,
} from '@votingworks/fixtures';
import {
  hasCrossoverVote,
  inferPartyFromVotes,
  partisanContests,
  votedPartyIds,
} from './combined_ballot_primary';

const combinedBallotPrimary = readElectionCombinedBallotPrimary();
const closedPrimary = readElectionTwoPartyPrimary();
const generalElection = readElectionGeneral();

const democraticPartyId = combinedBallotPrimary.parties.find(
  (p) => p.name === 'Democratic'
)!.id;
const republicanPartyId = combinedBallotPrimary.parties.find(
  (p) => p.name === 'Republican'
)!.id;

const democraticContest = combinedBallotPrimary.contests.find(
  (c): c is CandidateContest =>
    c.type === 'candidate' && c.partyId === democraticPartyId
)!;
const republicanContest = combinedBallotPrimary.contests.find(
  (c): c is CandidateContest =>
    c.type === 'candidate' && c.partyId === republicanPartyId
)!;
const nonpartisanContest = combinedBallotPrimary.contests.find(
  (c): c is YesNoContest => c.type === 'yesno'
)!;

describe('partisanContests', () => {
  test('returns all partisan contests in a combined ballot primary', () => {
    const result = partisanContests(combinedBallotPrimary);

    // Invariants:
    // - Every returned contest is a candidate contest with a partyId.
    // - No partisan contest in the election is missing from the result.
    expect(result.every((c) => c.type === 'candidate')).toEqual(true);
    expect(result.every((c) => c.partyId !== undefined)).toEqual(true);
    const resultIds = new Set(result.map((c) => c.id));
    const missingIds = combinedBallotPrimary.contests
      .filter((c) => c.type === 'candidate' && c.partyId !== undefined)
      .map((c) => c.id)
      .filter((id) => !resultIds.has(id));
    expect(missingIds).toEqual([]);

    expect(result.map((c) => c.id)).toMatchInlineSnapshot(`
      [
        "governor-democratic",
        "governor-republican",
        "governor-libertarian",
        "secretary-of-state-democratic",
        "secretary-of-state-republican",
        "secretary-of-state-libertarian",
        "attorney-general-democratic",
        "attorney-general-republican",
        "attorney-general-libertarian",
        "us-rep-democratic",
        "us-rep-republican",
        "us-rep-libertarian",
        "state-rep-democratic",
        "state-rep-republican",
        "state-rep-libertarian",
        "county-commissioner-democratic",
        "county-commissioner-republican",
        "county-commissioner-libertarian",
        "delegate-convention-democratic",
        "delegate-convention-republican",
        "delegate-convention-libertarian",
        "county-commissioner-democratic-south",
        "county-commissioner-republican-south",
        "county-commissioner-libertarian-south",
        "delegate-convention-democratic-south",
        "delegate-convention-republican-south",
        "delegate-convention-libertarian-south",
      ]
    `);
  });

  test('returns empty array for general election', () => {
    expect(partisanContests(generalElection)).toEqual([]);
  });
});

describe('votedPartyIds', () => {
  test('returns empty array when no partisan contests have selections', () => {
    expect(votedPartyIds(combinedBallotPrimary, {})).toEqual([]);
    expect(
      votedPartyIds(combinedBallotPrimary, {
        [nonpartisanContest.id]: [nonpartisanContest.options[0].id],
      })
    ).toEqual([]);
    expect(
      votedPartyIds(combinedBallotPrimary, {
        [democraticContest.id]: [],
        [republicanContest.id]: [],
      })
    ).toEqual([]);
  });

  test('returns single party for single-party votes', () => {
    expect(
      votedPartyIds(combinedBallotPrimary, {
        [democraticContest.id]: [democraticContest.candidates[0]!.id],
      })
    ).toEqual([democraticPartyId]);
  });

  test('returns all voted parties for multi-party votes', () => {
    const result = votedPartyIds(combinedBallotPrimary, {
      [democraticContest.id]: [democraticContest.candidates[0]!.id],
      [republicanContest.id]: [republicanContest.candidates[0]!.id],
    });
    expect(new Set(result)).toEqual(
      new Set([democraticPartyId, republicanPartyId] as PartyId[])
    );
  });

  test('returns empty array for general election (no partisan contests)', () => {
    const candidateContest = generalElection.contests.find(
      (c): c is CandidateContest => c.type === 'candidate'
    )!;
    expect(
      votedPartyIds(generalElection, {
        [candidateContest.id]: [candidateContest.candidates[0]!.id],
      })
    ).toEqual([]);
  });
});

describe('hasCrossoverVote', () => {
  // It's impossible to have crossover votes in a closed primary, since
  // each ballot style is only associated with one party, but we test it
  // anyway.
  test('false for closed primary', () => {
    expect(
      hasCrossoverVote(closedPrimary, {
        'best-animal-mammal': ['horse'],
        'zoo-council-mammal': ['zebra', 'lion'],
      })
    ).toEqual(false);
  });

  // It's also impossible to have crossover votes in a general election, since there
  // are no partisan contests, but we test it anyway.
  test('false for general election', () => {
    expect(
      hasCrossoverVote(generalElection, {
        president: ['barchi-hallaren'],
        senator: ['weiford'],
      })
    ).toEqual(false);
  });

  test('false for combined ballot primary single-party votes', () => {
    expect(
      hasCrossoverVote(combinedBallotPrimary, {
        [democraticContest.id]: [democraticContest.candidates[0]!.id],
      })
    ).toEqual(false);
  });

  test('false for combined ballot primary nonpartisan-only votes', () => {
    expect(
      hasCrossoverVote(combinedBallotPrimary, {
        [nonpartisanContest.id]: [nonpartisanContest.options[0].id],
      })
    ).toEqual(false);
  });

  test('true for combined ballot primary multi-party votes', () => {
    expect(
      hasCrossoverVote(combinedBallotPrimary, {
        [democraticContest.id]: [democraticContest.candidates[0]!.id],
        [republicanContest.id]: [republicanContest.candidates[0]!.id],
      })
    ).toEqual(true);
  });
});

describe('inferPartyFromVotes', () => {
  test('NO_PARTY_ID for combined ballot primary with no partisan votes', () => {
    expect(inferPartyFromVotes(combinedBallotPrimary, {})).toEqual(
      Tabulation.NO_PARTY_ID
    );
    expect(
      inferPartyFromVotes(combinedBallotPrimary, {
        [nonpartisanContest.id]: [nonpartisanContest.options[0].id],
      })
    ).toEqual(Tabulation.NO_PARTY_ID);
  });

  test('returns party for combined ballot primary single-party votes', () => {
    expect(
      inferPartyFromVotes(combinedBallotPrimary, {
        [democraticContest.id]: [democraticContest.candidates[0]!.id],
      })
    ).toEqual(democraticPartyId);
  });

  test('NO_PARTY_ID for combined ballot primary crossover votes', () => {
    expect(
      inferPartyFromVotes(combinedBallotPrimary, {
        [democraticContest.id]: [democraticContest.candidates[0]!.id],
        [republicanContest.id]: [republicanContest.candidates[0]!.id],
      })
    ).toEqual(Tabulation.NO_PARTY_ID);
  });
});
