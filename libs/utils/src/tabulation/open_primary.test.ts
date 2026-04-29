import { describe, expect, test } from 'vitest';
import { CandidateContest, PartyId, YesNoContest } from '@votingworks/types';
import {
  readElectionGeneral,
  readElectionOpenPrimary,
  readElectionTwoPartyPrimary,
} from '@votingworks/fixtures';
import {
  hasCrossoverVote,
  partisanContests,
  votedPartyIds,
} from './open_primary';

const openPrimary = readElectionOpenPrimary();
const closedPrimary = readElectionTwoPartyPrimary();
const generalElection = readElectionGeneral();

const democraticPartyId = openPrimary.parties.find(
  (p) => p.name === 'Democratic'
)!.id;
const republicanPartyId = openPrimary.parties.find(
  (p) => p.name === 'Republican'
)!.id;

const democraticContest = openPrimary.contests.find(
  (c): c is CandidateContest =>
    c.type === 'candidate' && c.partyId === democraticPartyId
)!;
const republicanContest = openPrimary.contests.find(
  (c): c is CandidateContest =>
    c.type === 'candidate' && c.partyId === republicanPartyId
)!;
const nonpartisanContest = openPrimary.contests.find(
  (c): c is YesNoContest => c.type === 'yesno'
)!;

describe('partisanContests', () => {
  test('returns all partisan contests in an open primary', () => {
    const result = partisanContests(openPrimary);

    // Invariants:
    // - Every returned contest is a candidate contest with a partyId.
    // - No partisan contest in the election is missing from the result.
    expect(result.every((c) => c.type === 'candidate')).toEqual(true);
    expect(result.every((c) => c.partyId !== undefined)).toEqual(true);
    const resultIds = new Set(result.map((c) => c.id));
    const missingIds = openPrimary.contests
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
    expect(votedPartyIds(openPrimary, {})).toEqual([]);
    expect(
      votedPartyIds(openPrimary, {
        [nonpartisanContest.id]: [nonpartisanContest.yesOption.id],
      })
    ).toEqual([]);
    expect(
      votedPartyIds(openPrimary, {
        [democraticContest.id]: [],
        [republicanContest.id]: [],
      })
    ).toEqual([]);
  });

  test('returns single party for single-party votes', () => {
    expect(
      votedPartyIds(openPrimary, {
        [democraticContest.id]: [democraticContest.candidates[0]!.id],
      })
    ).toEqual([democraticPartyId]);
  });

  test('returns all voted parties for multi-party votes', () => {
    const result = votedPartyIds(openPrimary, {
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

  test('false for open primary single-party votes', () => {
    expect(
      hasCrossoverVote(openPrimary, {
        [democraticContest.id]: [democraticContest.candidates[0]!.id],
      })
    ).toEqual(false);
  });

  test('false for open primary nonpartisan-only votes', () => {
    expect(
      hasCrossoverVote(openPrimary, {
        [nonpartisanContest.id]: [nonpartisanContest.yesOption.id],
      })
    ).toEqual(false);
  });

  test('true for open primary multi-party votes', () => {
    expect(
      hasCrossoverVote(openPrimary, {
        [democraticContest.id]: [democraticContest.candidates[0]!.id],
        [republicanContest.id]: [republicanContest.candidates[0]!.id],
      })
    ).toEqual(true);
  });
});
