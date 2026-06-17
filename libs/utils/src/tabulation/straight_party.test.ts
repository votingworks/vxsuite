import { describe, expect, test } from 'vitest';
import {
  Candidate,
  CandidateContest,
  Contest,
  Election,
  StraightPartyContest,
  YesNoContest,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { electionStraightPartyFixtures } from '@votingworks/fixtures';
import { deriveStraightPartyVotes } from './straight_party';

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

describe('vote-for-1 partisan offices (MI examples 3-9)', () => {
  const election = buildElection([
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

  test('example 3: straight party, no individual votes', () => {
    expect(
      deriveStraightPartyVotes(election, {
        'straight-party': ['party-2'],
        senator: [],
        representative: [],
      })
    ).toEqual({
      'straight-party': ['party-2'],
      senator: ['candidate-b'],
      representative: ['candidate-g'],
    });
  });

  test('example 4: overvoted straight party, no individual votes', () => {
    expect(
      deriveStraightPartyVotes(election, {
        'straight-party': ['party-2', 'party-3'],
        senator: [],
        representative: [],
      })
    ).toEqual({
      'straight-party': ['party-2', 'party-3'],
      senator: [],
      representative: [],
    });
  });

  test('example 5: straight party plus individual votes for that party', () => {
    expect(
      deriveStraightPartyVotes(election, {
        'straight-party': ['party-2'],
        senator: ['candidate-b'],
        representative: ['candidate-g'],
      })
    ).toEqual({
      'straight-party': ['party-2'],
      senator: ['candidate-b'],
      representative: ['candidate-g'],
    });
  });

  test('example 6: crossover vote fills the office, party vote fills the rest', () => {
    expect(
      deriveStraightPartyVotes(election, {
        'straight-party': ['party-1'],
        senator: ['candidate-b'],
        representative: [],
      })
    ).toEqual({
      'straight-party': ['party-1'],
      senator: ['candidate-b'],
      representative: ['candidate-f'],
    });
  });

  test('example 7: overvoted straight party, individual votes kept', () => {
    expect(
      deriveStraightPartyVotes(election, {
        'straight-party': ['party-1', 'party-3'],
        senator: ['candidate-a'],
        representative: ['candidate-g'],
      })
    ).toEqual({
      'straight-party': ['party-1', 'party-3'],
      senator: ['candidate-a'],
      representative: ['candidate-g'],
    });
  });

  test('example 8: overvoted straight party and overvoted offices', () => {
    expect(
      deriveStraightPartyVotes(election, {
        'straight-party': ['party-1', 'party-2'],
        senator: ['candidate-a', 'candidate-b'],
        representative: ['candidate-f', 'candidate-g'],
      })
    ).toEqual({
      'straight-party': ['party-1', 'party-2'],
      senator: ['candidate-a', 'candidate-b'],
      representative: ['candidate-f', 'candidate-g'],
    });
  });

  test('example 9: overvoted straight party, one office overvoted, one explicit', () => {
    expect(
      deriveStraightPartyVotes(election, {
        'straight-party': ['party-2', 'party-3'],
        senator: ['candidate-b', 'candidate-c'],
        representative: ['candidate-h'],
      })
    ).toEqual({
      'straight-party': ['party-2', 'party-3'],
      senator: ['candidate-b', 'candidate-c'],
      representative: ['candidate-h'],
    });
  });
});

describe('two vote-for-2 partisan offices (MI examples 10-12)', () => {
  const election = buildElection([
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

  test('example 10: blank office derives both party candidates; full office unchanged', () => {
    expect(
      deriveStraightPartyVotes(election, {
        'straight-party': ['party-1'],
        'state-board': [],
        regent: ['candidate-h', 'candidate-i'],
      })
    ).toEqual({
      'straight-party': ['party-1'],
      'state-board': ['candidate-a', 'candidate-b'],
      regent: ['candidate-h', 'candidate-i'],
    });
  });

  test('example 11: both offices full with explicit votes', () => {
    expect(
      deriveStraightPartyVotes(election, {
        'straight-party': ['party-1'],
        'state-board': ['candidate-d', 'candidate-e'],
        regent: [],
      })
    ).toEqual({
      'straight-party': ['party-1'],
      'state-board': ['candidate-d', 'candidate-e'],
      regent: ['candidate-f', 'candidate-g'],
    });
  });

  test('example 12: both offices full with cross-party votes', () => {
    expect(
      deriveStraightPartyVotes(election, {
        'straight-party': ['party-1'],
        'state-board': ['candidate-c', 'candidate-d'],
        regent: ['candidate-i', 'candidate-j'],
      })
    ).toEqual({
      'straight-party': ['party-1'],
      'state-board': ['candidate-c', 'candidate-d'],
      regent: ['candidate-i', 'candidate-j'],
    });
  });
});

describe('single vote-for-2 partisan office (MI examples 13-19)', () => {
  const election = buildElection([
    straightPartyContest,
    candidateContest('state-board', 2, [
      candidate('candidate-a', 'party-1'),
      candidate('candidate-b', 'party-1'),
      candidate('candidate-c', 'party-2'),
      candidate('candidate-d', 'party-2'),
      candidate('candidate-e', 'party-3'),
    ]),
  ]);

  test('example 13: party has 2 candidates, 1 seat left — ambiguous', () => {
    expect(
      deriveStraightPartyVotes(election, {
        'straight-party': ['party-1'],
        'state-board': ['candidate-c'],
      })
    ).toEqual({
      'straight-party': ['party-1'],
      'state-board': ['candidate-c'],
    });
  });

  test('example 14: one party candidate marked, one party candidate left', () => {
    expect(
      deriveStraightPartyVotes(election, {
        'straight-party': ['party-1'],
        'state-board': ['candidate-b'],
      })
    ).toEqual({
      'straight-party': ['party-1'],
      'state-board': ['candidate-b', 'candidate-a'],
    });
  });

  test('example 15: office full with mixed votes', () => {
    expect(
      deriveStraightPartyVotes(election, {
        'straight-party': ['party-1'],
        'state-board': ['candidate-b', 'candidate-c'],
      })
    ).toEqual({
      'straight-party': ['party-1'],
      'state-board': ['candidate-b', 'candidate-c'],
    });
  });

  test('example 16: party has 2 candidates, 1 seat left after crossover', () => {
    expect(
      deriveStraightPartyVotes(election, {
        'straight-party': ['party-1'],
        'state-board': ['candidate-e'],
      })
    ).toEqual({
      'straight-party': ['party-1'],
      'state-board': ['candidate-e'],
    });
  });

  test('example 17: party has only 1 candidate for a vote-for-2 office', () => {
    expect(
      deriveStraightPartyVotes(election, {
        'straight-party': ['party-3'],
        'state-board': [],
      })
    ).toEqual({
      'straight-party': ['party-3'],
      'state-board': ['candidate-e'],
    });
  });

  test('example 18: crossover vote plus single party candidate', () => {
    expect(
      deriveStraightPartyVotes(election, {
        'straight-party': ['party-3'],
        'state-board': ['candidate-b'],
      })
    ).toEqual({
      'straight-party': ['party-3'],
      'state-board': ['candidate-b', 'candidate-e'],
    });
  });

  test('example 19: party vote plus one party candidate marked (not an overvote)', () => {
    expect(
      deriveStraightPartyVotes(election, {
        'straight-party': ['party-2'],
        'state-board': ['candidate-c'],
      })
    ).toEqual({
      'straight-party': ['party-2'],
      'state-board': ['candidate-c', 'candidate-d'],
    });
  });
});

describe('other cases not covered by examples', () => {
  const voteFor1Election = buildElection([
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

  const stateBoardElection = buildElection([
    straightPartyContest,
    candidateContest('state-board', 2, [
      candidate('candidate-a', 'party-1'),
      candidate('candidate-b', 'party-1'),
      candidate('candidate-e', 'party-3'),
    ]),
  ]);

  test('no straight-party contest in the election — votes returned unchanged', () => {
    const election = buildElection([
      candidateContest('senator', 1, [
        candidate('candidate-a', 'party-1'),
        candidate('candidate-b', 'party-2'),
      ]),
    ]);
    expect(deriveStraightPartyVotes(election, { senator: [] })).toEqual({
      senator: [],
    });
  });

  test('no straight-party selection — tabulate offices as marked', () => {
    expect(
      deriveStraightPartyVotes(voteFor1Election, {
        'straight-party': [],
        senator: [],
        representative: ['candidate-g'],
      })
    ).toEqual({
      'straight-party': [],
      senator: [],
      representative: ['candidate-g'],
    });
  });

  test('selected party has no candidates anywhere — nothing derived', () => {
    expect(
      deriveStraightPartyVotes(voteFor1Election, {
        'straight-party': ['party-6'],
        senator: [],
        representative: [],
      })
    ).toEqual({
      'straight-party': ['party-6'],
      senator: [],
      representative: [],
    });
  });

  test('a write-in occupies a seat, leaving the party derivation ambiguous', () => {
    expect(
      deriveStraightPartyVotes(stateBoardElection, {
        'straight-party': ['party-1'],
        'state-board': ['write-in-0'],
      })
    ).toEqual({
      'straight-party': ['party-1'],
      'state-board': ['write-in-0'],
    });
  });

  test('a write-in occupies a seat, a single fitting party candidate is still derived', () => {
    expect(
      deriveStraightPartyVotes(stateBoardElection, {
        'straight-party': ['party-3'],
        'state-board': ['write-in-0'],
      })
    ).toEqual({
      'straight-party': ['party-3'],
      'state-board': ['write-in-0', 'candidate-e'],
    });
  });

  test('non-partisan candidate contests and ballot measures are untouched', () => {
    const yesNoContest: YesNoContest = {
      id: 'measure',
      type: 'yesno',
      districtId,
      title: 'Measure',
      description: 'A ballot measure',
      yesOption: { id: 'measure-yes', label: 'Yes' },
      noOption: { id: 'measure-no', label: 'No' },
    };
    const election = buildElection([
      straightPartyContest,
      candidateContest('senator', 1, [
        candidate('candidate-a', 'party-1'),
        candidate('candidate-b', 'party-2'),
      ]),
      candidateContest('judge', 1, [
        { id: 'candidate-judge', name: 'A Judge' },
      ]),
      yesNoContest,
    ]);

    expect(
      deriveStraightPartyVotes(election, {
        'straight-party': ['party-1'],
        senator: [],
        judge: [],
        measure: ['measure-yes'],
      })
    ).toEqual({
      'straight-party': ['party-1'],
      senator: ['candidate-a'],
      judge: [],
      measure: ['measure-yes'],
    });
  });
});
