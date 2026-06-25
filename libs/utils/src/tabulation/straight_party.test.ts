import { expect, test } from 'vitest';
import {
  Candidate,
  CandidateContest,
  Contest,
  Election,
  PartyId,
  StraightPartyContest,
  Tabulation,
} from '@votingworks/types';
import { assertDefined, find } from '@votingworks/basics';
import { electionStraightPartyFixtures } from '@votingworks/fixtures';
import {
  deriveStraightPartyVotes,
  deriveStraightPartyVotesForContest,
  selectedStraightPartyId,
} from './straight_party';

// These tests encode the Michigan straight-party tabulation rules from Michigan
// Administrative Rule R 168.773, Rule 3(6) using the examples provided in that
// document.

const baseElection = electionStraightPartyFixtures.readElection();
const { id: districtId } = assertDefined(baseElection.districts[0]);

function candidate(id: string, partyId: string): Candidate {
  return { id, name: id, partyIds: [partyId] };
}

const straightPartyContest: StraightPartyContest = {
  id: 'straight-party',
  type: 'straight-party',
  districtId,
  title: 'Straight Party Ticket',
  optionIds: ['party-1', 'party-2', 'party-3', 'party-4', 'party-5', 'party-6'],
};

function candidateContest(
  id: string,
  seats: number,
  candidates: Candidate[]
): CandidateContest {
  return {
    id,
    type: 'candidate',
    districtId,
    title: id,
    seats,
    candidates,
    allowWriteIns: true,
  };
}

function buildElection(contests: Contest[]): Election {
  return { ...baseElection, contests };
}

// Election for the vote-for-1 MI examples (3-9)
const voteForOneElection = buildElection([
  straightPartyContest,
  candidateContest('senator', 1, [
    candidate('candidate-a', 'party-1'),
    candidate('candidate-b', 'party-2'),
    candidate('candidate-c', 'party-3'),
    candidate('candidate-d', 'party-4'),
    candidate('candidate-e', 'party-5'),
  ]),
  candidateContest('representative', 1, [
    candidate('candidate-f', 'party-1'),
    candidate('candidate-g', 'party-2'),
    candidate('candidate-h', 'party-3'),
  ]),
]);

// Election for the two vote-for-2 office MI examples (10-12)
const twoVoteForTwoElection = buildElection([
  straightPartyContest,
  candidateContest('state-board', 2, [
    candidate('candidate-a', 'party-1'),
    candidate('candidate-b', 'party-1'),
    candidate('candidate-c', 'party-2'),
    candidate('candidate-d', 'party-2'),
    candidate('candidate-e', 'party-3'),
  ]),
  candidateContest('regent', 2, [
    candidate('candidate-f', 'party-1'),
    candidate('candidate-g', 'party-1'),
    candidate('candidate-h', 'party-2'),
    candidate('candidate-i', 'party-2'),
    candidate('candidate-j', 'party-3'),
  ]),
]);

// Election for the single vote-for-2 office MI examples (13-19)
const oneVoteForTwoElection = buildElection([
  straightPartyContest,
  candidateContest('state-board', 2, [
    candidate('candidate-a', 'party-1'),
    candidate('candidate-b', 'party-1'),
    candidate('candidate-c', 'party-2'),
    candidate('candidate-d', 'party-2'),
    candidate('candidate-e', 'party-3'),
  ]),
]);

const noStraightPartyElection = buildElection([
  candidateContest('senator', 1, [
    candidate('candidate-a', 'party-1'),
    candidate('candidate-b', 'party-2'),
  ]),
]);

const simpleVoteForOneElection = buildElection([
  straightPartyContest,
  candidateContest('senator', 1, [
    candidate('candidate-a', 'party-1'),
    candidate('candidate-b', 'party-2'),
  ]),
  candidateContest('representative', 1, [
    candidate('candidate-f', 'party-1'),
    candidate('candidate-g', 'party-2'),
  ]),
]);

const partialStateBoardElection = buildElection([
  straightPartyContest,
  candidateContest('state-board', 2, [
    candidate('candidate-a', 'party-1'),
    candidate('candidate-b', 'party-1'),
    candidate('candidate-e', 'party-3'),
  ]),
]);

// An election with a non-partisan office (a candidate with no party) and a
// ballot measure, neither of which a straight party vote should affect.
const nonpartisanElection = buildElection([
  straightPartyContest,
  candidateContest('senator', 1, [
    candidate('candidate-a', 'party-1'),
    candidate('candidate-b', 'party-2'),
  ]),
  candidateContest('judge', 1, [{ id: 'candidate-judge', name: 'A Judge' }]),
  {
    id: 'measure',
    type: 'yesno',
    districtId,
    title: 'Measure',
    description: 'A ballot measure',
    options: [
      { id: 'measure-yes', label: 'Yes' },
      { id: 'measure-no', label: 'No' },
    ],
  },
]);

interface TestCase {
  name: string;
  election: Election;
  inputVotes: Tabulation.Votes;
  /** The party selected by the straight party contest, if any */
  expectedParty?: PartyId;
  /** The combined result votes after adding in derived votes to the input votes */
  expectedVotes: Tabulation.Votes;
  /** Just the additional votes derived from the straight party selection */
  expectedDerivedVotes: Tabulation.Votes;
}

test.each<TestCase>([
  // Vote-for-1 partisan offices (MI examples 3-9)
  {
    name: 'example 3: straight party, no individual votes',
    election: voteForOneElection,
    inputVotes: {
      'straight-party': ['party-2'],
      senator: [],
      representative: [],
    },
    expectedParty: 'party-2',
    expectedVotes: {
      'straight-party': ['party-2'],
      senator: ['candidate-b'],
      representative: ['candidate-g'],
    },
    expectedDerivedVotes: {
      senator: ['candidate-b'],
      representative: ['candidate-g'],
    },
  },
  {
    name: 'example 4: overvoted straight party, no individual votes',
    election: voteForOneElection,
    inputVotes: {
      'straight-party': ['party-2', 'party-3'],
      senator: [],
      representative: [],
    },
    expectedParty: undefined,
    expectedVotes: {
      'straight-party': ['party-2', 'party-3'],
      senator: [],
      representative: [],
    },
    expectedDerivedVotes: { senator: [], representative: [] },
  },
  {
    name: 'example 5: straight party plus individual votes for that party',
    election: voteForOneElection,
    inputVotes: {
      'straight-party': ['party-2'],
      senator: ['candidate-b'],
      representative: ['candidate-g'],
    },
    expectedParty: 'party-2',
    expectedVotes: {
      'straight-party': ['party-2'],
      senator: ['candidate-b'],
      representative: ['candidate-g'],
    },
    expectedDerivedVotes: { senator: [], representative: [] },
  },
  {
    name: 'example 6: crossover vote fills the office, party vote fills the rest',
    election: voteForOneElection,
    inputVotes: {
      'straight-party': ['party-1'],
      senator: ['candidate-b'],
      representative: [],
    },
    expectedParty: 'party-1',
    expectedVotes: {
      'straight-party': ['party-1'],
      senator: ['candidate-b'],
      representative: ['candidate-f'],
    },
    expectedDerivedVotes: { senator: [], representative: ['candidate-f'] },
  },
  {
    name: 'example 7: overvoted straight party, individual votes kept',
    election: voteForOneElection,
    inputVotes: {
      'straight-party': ['party-1', 'party-3'],
      senator: ['candidate-a'],
      representative: ['candidate-g'],
    },
    expectedParty: undefined,
    expectedVotes: {
      'straight-party': ['party-1', 'party-3'],
      senator: ['candidate-a'],
      representative: ['candidate-g'],
    },
    expectedDerivedVotes: { senator: [], representative: [] },
  },
  {
    name: 'example 8: overvoted straight party and overvoted offices',
    election: voteForOneElection,
    inputVotes: {
      'straight-party': ['party-1', 'party-2'],
      senator: ['candidate-a', 'candidate-b'],
      representative: ['candidate-f', 'candidate-g'],
    },
    expectedParty: undefined,
    expectedVotes: {
      'straight-party': ['party-1', 'party-2'],
      senator: ['candidate-a', 'candidate-b'],
      representative: ['candidate-f', 'candidate-g'],
    },
    expectedDerivedVotes: { senator: [], representative: [] },
  },
  {
    name: 'example 9: overvoted straight party, one office overvoted, one explicit',
    election: voteForOneElection,
    inputVotes: {
      'straight-party': ['party-2', 'party-3'],
      senator: ['candidate-b', 'candidate-c'],
      representative: ['candidate-h'],
    },
    expectedParty: undefined,
    expectedVotes: {
      'straight-party': ['party-2', 'party-3'],
      senator: ['candidate-b', 'candidate-c'],
      representative: ['candidate-h'],
    },
    expectedDerivedVotes: { senator: [], representative: [] },
  },

  // Two vote-for-2 partisan offices (MI examples 10-12)
  {
    name: 'example 10: blank office derives both party candidates; full office unchanged',
    election: twoVoteForTwoElection,
    inputVotes: {
      'straight-party': ['party-1'],
      'state-board': [],
      regent: ['candidate-h', 'candidate-i'],
    },
    expectedParty: 'party-1',
    expectedVotes: {
      'straight-party': ['party-1'],
      'state-board': ['candidate-a', 'candidate-b'],
      regent: ['candidate-h', 'candidate-i'],
    },
    expectedDerivedVotes: {
      'state-board': ['candidate-a', 'candidate-b'],
      regent: [],
    },
  },
  {
    name: 'example 11: both offices full with explicit votes',
    election: twoVoteForTwoElection,
    inputVotes: {
      'straight-party': ['party-1'],
      'state-board': ['candidate-d', 'candidate-e'],
      regent: [],
    },
    expectedParty: 'party-1',
    expectedVotes: {
      'straight-party': ['party-1'],
      'state-board': ['candidate-d', 'candidate-e'],
      regent: ['candidate-f', 'candidate-g'],
    },
    expectedDerivedVotes: {
      'state-board': [],
      regent: ['candidate-f', 'candidate-g'],
    },
  },
  {
    name: 'example 12: both offices full with cross-party votes',
    election: twoVoteForTwoElection,
    inputVotes: {
      'straight-party': ['party-1'],
      'state-board': ['candidate-c', 'candidate-d'],
      regent: ['candidate-i', 'candidate-j'],
    },
    expectedParty: 'party-1',
    expectedVotes: {
      'straight-party': ['party-1'],
      'state-board': ['candidate-c', 'candidate-d'],
      regent: ['candidate-i', 'candidate-j'],
    },
    expectedDerivedVotes: { 'state-board': [], regent: [] },
  },

  // Single vote-for-2 partisan office (MI examples 13-19)
  {
    name: 'example 13: party has 2 candidates, 1 seat left — ambiguous',
    election: oneVoteForTwoElection,
    inputVotes: {
      'straight-party': ['party-1'],
      'state-board': ['candidate-c'],
    },
    expectedParty: 'party-1',
    expectedVotes: {
      'straight-party': ['party-1'],
      'state-board': ['candidate-c'],
    },
    expectedDerivedVotes: { 'state-board': [] },
  },
  {
    name: 'example 14: one party candidate marked, one party candidate left',
    election: oneVoteForTwoElection,
    inputVotes: {
      'straight-party': ['party-1'],
      'state-board': ['candidate-b'],
    },
    expectedParty: 'party-1',
    expectedVotes: {
      'straight-party': ['party-1'],
      'state-board': ['candidate-b', 'candidate-a'],
    },
    expectedDerivedVotes: { 'state-board': ['candidate-a'] },
  },
  {
    name: 'example 15: office full with mixed votes',
    election: oneVoteForTwoElection,
    inputVotes: {
      'straight-party': ['party-1'],
      'state-board': ['candidate-b', 'candidate-c'],
    },
    expectedParty: 'party-1',
    expectedVotes: {
      'straight-party': ['party-1'],
      'state-board': ['candidate-b', 'candidate-c'],
    },
    expectedDerivedVotes: { 'state-board': [] },
  },
  {
    name: 'example 16: party has 2 candidates, 1 seat left after crossover',
    election: oneVoteForTwoElection,
    inputVotes: {
      'straight-party': ['party-1'],
      'state-board': ['candidate-e'],
    },
    expectedParty: 'party-1',
    expectedVotes: {
      'straight-party': ['party-1'],
      'state-board': ['candidate-e'],
    },
    expectedDerivedVotes: { 'state-board': [] },
  },
  {
    name: 'example 17: party has only 1 candidate for a vote-for-2 office',
    election: oneVoteForTwoElection,
    inputVotes: { 'straight-party': ['party-3'], 'state-board': [] },
    expectedParty: 'party-3',
    expectedVotes: {
      'straight-party': ['party-3'],
      'state-board': ['candidate-e'],
    },
    expectedDerivedVotes: { 'state-board': ['candidate-e'] },
  },
  {
    name: 'example 18: crossover vote plus single party candidate',
    election: oneVoteForTwoElection,
    inputVotes: {
      'straight-party': ['party-3'],
      'state-board': ['candidate-b'],
    },
    expectedParty: 'party-3',
    expectedVotes: {
      'straight-party': ['party-3'],
      'state-board': ['candidate-b', 'candidate-e'],
    },
    expectedDerivedVotes: { 'state-board': ['candidate-e'] },
  },
  {
    name: 'example 19: party vote plus one party candidate marked (not an overvote)',
    election: oneVoteForTwoElection,
    inputVotes: {
      'straight-party': ['party-2'],
      'state-board': ['candidate-c'],
    },
    expectedParty: 'party-2',
    expectedVotes: {
      'straight-party': ['party-2'],
      'state-board': ['candidate-c', 'candidate-d'],
    },
    expectedDerivedVotes: { 'state-board': ['candidate-d'] },
  },

  // Other cases not covered by the MI examples
  {
    name: 'election has no straight-party contest — nothing derived',
    election: noStraightPartyElection,
    inputVotes: { senator: [] },
    expectedParty: undefined,
    expectedVotes: { senator: [] },
    expectedDerivedVotes: { senator: [] },
  },
  {
    name: 'straight-party contest present but unvoted — nothing derived',
    election: simpleVoteForOneElection,
    inputVotes: { senator: [], representative: ['candidate-g'] },
    expectedParty: undefined,
    expectedVotes: { senator: [], representative: ['candidate-g'] },
    expectedDerivedVotes: { senator: [], representative: [] },
  },
  {
    name: 'selected party has no candidates anywhere — nothing derived',
    election: simpleVoteForOneElection,
    inputVotes: {
      'straight-party': ['party-6'],
      senator: [],
      representative: [],
    },
    expectedParty: 'party-6',
    expectedVotes: {
      'straight-party': ['party-6'],
      senator: [],
      representative: [],
    },
    expectedDerivedVotes: { senator: [], representative: [] },
  },
  {
    name: 'a write-in occupies a seat, a single fitting party candidate is still derived',
    election: partialStateBoardElection,
    inputVotes: {
      'straight-party': ['party-3'],
      'state-board': ['write-in-0'],
    },
    expectedParty: 'party-3',
    expectedVotes: {
      'straight-party': ['party-3'],
      'state-board': ['write-in-0', 'candidate-e'],
    },
    expectedDerivedVotes: { 'state-board': ['candidate-e'] },
  },
  {
    name: 'non-partisan offices and ballot measures derive nothing',
    election: nonpartisanElection,
    inputVotes: {
      'straight-party': ['party-1'],
      senator: [],
      judge: [],
      measure: ['measure-yes'],
    },
    expectedParty: 'party-1',
    expectedVotes: {
      'straight-party': ['party-1'],
      senator: ['candidate-a'],
      judge: [],
      measure: ['measure-yes'],
    },
    expectedDerivedVotes: {
      senator: ['candidate-a'],
      judge: [],
      measure: [],
    },
  },
])(
  '$name',
  ({
    election,
    inputVotes,
    expectedParty,
    expectedVotes,
    expectedDerivedVotes,
  }) => {
    const party = selectedStraightPartyId(election, inputVotes);
    expect(party).toEqual(expectedParty);
    expect(deriveStraightPartyVotes(election, inputVotes)).toEqual(
      expectedVotes
    );
    for (const contestId of Object.keys(expectedDerivedVotes)) {
      expect(
        deriveStraightPartyVotesForContest(
          find(election.contests, (c) => c.id === contestId),
          assertDefined(inputVotes[contestId]),
          party
        )
      ).toEqual(expectedDerivedVotes[contestId]);
    }
  }
);
