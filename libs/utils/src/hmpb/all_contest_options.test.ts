import {
  BallotStyle,
  CandidateContest,
  District,
  Party,
  StraightPartyContest,
  YesNoContest,
  YesNoContestOption,
} from '@votingworks/types';
import { expect, test } from 'vitest';
import { allContestOptions, contestOptionName } from './all_contest_options';

const parties: [Party, Party] = [
  { id: 'party-1', name: 'Party 1', fullName: 'Party One', abbrev: 'P1' },
  { id: 'party-2', name: 'Party 2', fullName: 'Party Two', abbrev: 'P2' },
];

const districts: [District, District] = [
  { id: 'district-1', name: 'District 1' },
  { id: 'district-2', name: 'District 2' },
];

const contests: [CandidateContest, CandidateContest, YesNoContest] = [
  {
    type: 'candidate',
    id: 'contest-1',
    districtId: districts[0].id,
    title: 'Contest 1',
    seats: 1,
    candidates: [
      { id: 'candidate-a', name: 'Candidate A' },
      { id: 'candidate-b', name: 'Candidate B' },
      { id: 'candidate-c', name: 'Candidate C' },
    ],
    allowWriteIns: false,
  },
  {
    type: 'candidate',
    id: 'contest-2',
    districtId: districts[1].id,
    title: 'Contest 2',
    seats: 1,
    candidates: [{ id: 'candidate-z', name: 'Candidate Z' }],
    allowWriteIns: true,
  },
  {
    type: 'yesno',
    id: 'contest-3',
    districtId: districts[1].id,
    title: 'Contest 3',
    description: 'YesNoContest description',
    options: [
      { id: 'contest-3-yesno-option-1', label: 'Yes' },
      { id: 'contest-3-yesno-option-2', label: 'No' },
    ],
  },
];

const ballotStyles: [BallotStyle] = [
  {
    id: 'ballot-style-1',
    groupId: 'ballot-style-group-1',
    precincts: ['precinct-1'],
    districts: [districts[0].id],
    languages: ['en'],
  },
];

test('candidate contest without write-ins', () => {
  const contest = contests[0];
  expect(contest.allowWriteIns).toBeFalsy();
  expect(contest.candidates).toHaveLength(3);
  expect(Array.from(allContestOptions(contest, ballotStyles[0]))).toEqual([
    expect.objectContaining({ isWriteIn: false }),
    expect.objectContaining({ isWriteIn: false }),
    expect.objectContaining({ isWriteIn: false }),
  ]);
});

test('candidate contest with write-ins', () => {
  const contest = contests[1];
  expect(contest.allowWriteIns).toBeTruthy();
  expect(contest.candidates).toHaveLength(1);
  expect(Array.from(allContestOptions(contest, ballotStyles[0]))).toEqual([
    expect.objectContaining({ isWriteIn: false }),
    expect.objectContaining({ isWriteIn: true }),
  ]);
});

test('yesno contest', () => {
  const contest = contests[2];
  expect(Array.from(allContestOptions(contest))).toEqual<YesNoContestOption[]>([
    { type: 'yesno', id: contest.options[0].id, contestId: contest.id },
    { type: 'yesno', id: contest.options[1].id, contestId: contest.id },
  ]);
});

test('candidate contest with ballot style ordering', () => {
  // Create a contest with candidates A, B, C
  const contest: CandidateContest = {
    type: 'candidate',
    id: 'contest-1',
    title: 'Test Contest',
    districtId: 'district-1',
    seats: 1,
    allowWriteIns: false,
    candidates: [
      { id: 'candidate-a', name: 'Alice', partyIds: [] },
      { id: 'candidate-b', name: 'Bob', partyIds: [] },
      { id: 'candidate-c', name: 'Charlie', partyIds: [] },
    ],
  };

  // Create a ballot style that orders them as C, A, B
  const ballotStyle: BallotStyle = {
    id: 'ballot-style-1',
    groupId: 'group-1',
    precincts: ['precinct-1'],
    districts: ['district-1'],
    languages: ['en'],
    orderedCandidatesByContest: {
      'contest-1': [
        { id: 'candidate-c' },
        { id: 'candidate-a' },
        { id: 'candidate-b' },
      ],
    },
  };

  const options = Array.from(allContestOptions(contest, ballotStyle));

  // Verify the order matches the ballot style ordering
  expect(options).toHaveLength(3);
  expect(options[0]?.id).toEqual('candidate-c');
  expect(contestOptionName({ parties }, contest, options[0]!)).toEqual(
    'Charlie'
  );
  expect(options[1]?.id).toEqual('candidate-a');
  expect(contestOptionName({ parties }, contest, options[1]!)).toEqual('Alice');
  expect(options[2]?.id).toEqual('candidate-b');
  expect(contestOptionName({ parties }, contest, options[2]!)).toEqual('Bob');
});

test('candidate contest with multi-endorsed candidates are deduplicated', () => {
  // Create a contest with a multi-endorsed candidate
  const contest: CandidateContest = {
    type: 'candidate',
    id: 'contest-1',
    title: 'Test Contest',
    districtId: 'district-1',
    seats: 1,
    allowWriteIns: false,
    candidates: [
      { id: 'candidate-a', name: 'Alice', partyIds: ['party-1', 'party-2'] },
      { id: 'candidate-b', name: 'Bob', partyIds: ['party-3'] },
    ],
  };

  // Create a ballot style that lists the multi-endorsed candidate twice
  // (once for each party endorsement)
  const ballotStyle: BallotStyle = {
    id: 'ballot-style-1',
    groupId: 'group-1',
    precincts: ['precinct-1'],
    districts: ['district-1'],
    languages: ['en'],
    orderedCandidatesByContest: {
      'contest-1': [
        { id: 'candidate-a', partyIds: ['party-1'] },
        { id: 'candidate-b' },
        { id: 'candidate-a', partyIds: ['party-2'] },
      ],
    },
  };

  const options = Array.from(allContestOptions(contest, ballotStyle));

  // Verify multi-endorsed candidate appears only once (deduplicated by id)
  expect(options).toHaveLength(2);
  expect(options[0]?.id).toEqual('candidate-a');
  expect(contestOptionName({ parties }, contest, options[0]!)).toEqual('Alice');
  expect(options[1]?.id).toEqual('candidate-b');
  expect(contestOptionName({ parties }, contest, options[1]!)).toEqual('Bob');
});

test('straight party contest', () => {
  const contest: StraightPartyContest = {
    type: 'straight-party',
    id: 'contest-1',
    title: 'Straight Party Ticket',
    districtId: 'district-1',
    optionIds: ['party-1', 'party-2'],
  };

  const options = Array.from(allContestOptions(contest));

  expect(options).toEqual([
    {
      type: 'straight-party',
      id: 'party-1',
      contestId: 'contest-1',
    },
    {
      type: 'straight-party',
      id: 'party-2',
      contestId: 'contest-1',
    },
  ]);
  expect(contestOptionName({ parties }, contest, options[0]!)).toEqual(
    'Party One'
  );
  expect(contestOptionName({ parties }, contest, options[1]!)).toEqual(
    'Party Two'
  );
});
