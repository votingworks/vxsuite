import { expect, test } from 'vitest';
import { CandidateContest, Election, VotesDict } from '@votingworks/types';
import { getIndirectCandidateIds } from './straight_party_votes';

const PARTY_A = 'party-a';
const PARTY_B = 'party-b';

const BASE_ELECTION: Election = {
  title: 'Test Election',
  state: 'Test State',
  county: { id: 'county-1', name: 'Test County' },
  date: { toMidnightDatetimeWithSystemTimezone: () => new Date() },
  type: 'general',
  seal: '',
  parties: [
    { id: PARTY_A, name: 'Party A', fullName: 'Party A' },
    { id: PARTY_B, name: 'Party B', fullName: 'Party B' },
  ],
  precincts: [{ id: 'precinct-1', name: 'Precinct 1' }],
  districts: [{ id: 'district-1', name: 'District 1' }],
  ballotStyles: [
    {
      id: 'ballot-style-1',
      groupId: '1',
      precincts: ['precinct-1'],
      districts: ['district-1'],
      partyId: undefined,
    },
  ],
  contests: [
    {
      id: 'straight-party',
      type: 'straight-party',
      title: 'Straight Party',
    },
    {
      id: 'president',
      type: 'candidate',
      title: 'President',
      districtId: 'district-1',
      seats: 1,
      allowWriteIns: false,
      candidates: [
        { id: 'alice', name: 'Alice', partyIds: [PARTY_A] },
        { id: 'bob', name: 'Bob', partyIds: [PARTY_B] },
      ],
    },
    {
      id: 'council',
      type: 'candidate',
      title: 'Council',
      districtId: 'district-1',
      seats: 3,
      allowWriteIns: false,
      candidates: [
        { id: 'c1', name: 'C1', partyIds: [PARTY_A] },
        { id: 'c2', name: 'C2', partyIds: [PARTY_A] },
        { id: 'c3', name: 'C3', partyIds: [PARTY_B] },
        { id: 'c4', name: 'C4', partyIds: [PARTY_B] },
      ],
    },
  ],
} as unknown as Election;

function buildElection(overrides: Partial<Election> = {}): Election {
  return { ...BASE_ELECTION, ...overrides };
}

test('returns empty set when no straight party contest', () => {
  const election = buildElection({ contests: [buildElection().contests[1]] });
  const contest = election.contests[0] as CandidateContest;
  const result = getIndirectCandidateIds(election, {}, contest);
  expect(result.size).toEqual(0);
});

test('returns empty set when no straight party vote', () => {
  const election = buildElection();
  const contest = election.contests[1] as CandidateContest;
  const result = getIndirectCandidateIds(election, {}, contest);
  expect(result.size).toEqual(0);
});

test('returns empty set when straight party overvoted', () => {
  const election = buildElection();
  const contest = election.contests[1] as CandidateContest;
  const votes: VotesDict = { 'straight-party': [PARTY_A, PARTY_B] };
  const result = getIndirectCandidateIds(election, votes, contest);
  expect(result.size).toEqual(0);
});

test('returns party candidates for single-seat contest', () => {
  const election = buildElection();
  const contest = election.contests[1] as CandidateContest;
  const votes: VotesDict = { 'straight-party': [PARTY_A] };
  const result = getIndirectCandidateIds(election, votes, contest);
  expect(result).toEqual(new Set(['alice']));
});

test('returns party candidates for multi-seat contest', () => {
  const election = buildElection();
  const contest = election.contests[2] as CandidateContest;
  const votes: VotesDict = { 'straight-party': [PARTY_A] };
  const result = getIndirectCandidateIds(election, votes, contest);
  expect(result).toEqual(new Set(['c1', 'c2']));
});

test('excludes directly voted candidates', () => {
  const election = buildElection();
  const contest = election.contests[2] as CandidateContest;
  const votes: VotesDict = {
    'straight-party': [PARTY_A],
    council: [{ id: 'c1', name: 'C1', partyIds: [PARTY_A] }],
  };
  const result = getIndirectCandidateIds(election, votes, contest);
  expect(result).toEqual(new Set(['c2']));
});

test('returns empty set when voter already filled all seats', () => {
  const election = buildElection();
  const contest = election.contests[2] as CandidateContest;
  const votes: VotesDict = {
    'straight-party': [PARTY_A],
    council: [
      { id: 'c1', name: 'C1', partyIds: [PARTY_A] },
      { id: 'c3', name: 'C3', partyIds: [PARTY_B] },
      { id: 'c4', name: 'C4', partyIds: [PARTY_B] },
    ],
  };
  const result = getIndirectCandidateIds(election, votes, contest);
  expect(result.size).toEqual(0);
});

test('returns empty set when expansion is non-deterministic', () => {
  // 3-seat contest with 3 party-A candidates but only 2 remaining seats
  const election = buildElection({
    contests: [
      buildElection().contests[0],
      {
        id: 'big-council',
        type: 'candidate',
        title: 'Big Council',
        districtId: 'district-1',
        seats: 3,
        allowWriteIns: false,
        candidates: [
          { id: 'a1', name: 'A1', partyIds: [PARTY_A] },
          { id: 'a2', name: 'A2', partyIds: [PARTY_A] },
          { id: 'a3', name: 'A3', partyIds: [PARTY_A] },
          { id: 'b1', name: 'B1', partyIds: [PARTY_B] },
        ],
      },
    ],
  });
  const contest = election.contests[1] as CandidateContest;
  const votes: VotesDict = {
    'straight-party': [PARTY_A],
    'big-council': [{ id: 'b1', name: 'B1', partyIds: [PARTY_B] }],
  };
  const result = getIndirectCandidateIds(election, votes, contest);
  // 3 unselected party candidates but only 2 remaining seats = non-deterministic
  expect(result.size).toEqual(0);
});
