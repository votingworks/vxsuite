import { expect, test } from 'vitest';
import {
  BallotStyle,
  Candidate,
  CandidateContest,
  GridPositionOption,
} from '@votingworks/types';
import { voteMatchesGridPosition } from './vote_matching';

const mockContest: CandidateContest = {
  type: 'candidate',
  id: 'mayor',
  districtId: 'district-1',
  title: 'Mayor',
  seats: 1,
  candidates: [
    {
      id: 'alice',
      name: 'Alice Johnson',
      partyIds: ['0', '1'], // Cross-endorsed by parties 0 and 1
    },
    {
      id: 'bob',
      name: 'Bob Smith',
      partyIds: ['2'],
    },
  ],
  allowWriteIns: false,
};

const mockBallotStyle: BallotStyle = {
  id: '1',
  groupId: '1',
  precincts: ['precinct-1'],
  districts: ['district-1'],
  orderedCandidatesByContest: {
    mayor: [
      { id: 'alice', partyIds: ['0', '1'] }, // Alice with parties 0,1
      { id: 'alice', partyIds: ['2'] }, // Alice with party 2 (different endorsement)
      { id: 'bob', partyIds: ['2'] },
    ],
  },
};

const gridPositions: GridPositionOption[] = [
  {
    type: 'option',
    sheetNumber: 1,
    side: 'front',
    column: 2,
    row: 10,
    contestId: 'mayor',
    optionId: 'alice', // First Alice bubble (parties 0,1)
  },
  {
    type: 'option',
    sheetNumber: 1,
    side: 'front',
    column: 2,
    row: 12,
    contestId: 'mayor',
    optionId: 'alice', // Second Alice bubble (party 2)
  },
  {
    type: 'option',
    sheetNumber: 1,
    side: 'front',
    column: 2,
    row: 14,
    contestId: 'mayor',
    optionId: 'bob',
  },
];

test('voteMatchesGridPosition - matches non-cross-endorsed candidate', () => {
  const vote: Candidate = {
    id: 'bob',
    name: 'Bob Smith',
    partyIds: ['2'],
  };

  const bobGridPos = gridPositions[2];

  expect(
    voteMatchesGridPosition(
      vote,
      bobGridPos,
      mockContest,
      mockBallotStyle,
      gridPositions
    )
  ).toEqual(true);
});

test('voteMatchesGridPosition - matches first cross-endorsed option', () => {
  const vote: Candidate = {
    id: 'alice',
    name: 'Alice Johnson',
    partyIds: ['0', '1'],
  };

  const firstAliceGridPos = gridPositions[0];

  expect(
    voteMatchesGridPosition(
      vote,
      firstAliceGridPos,
      mockContest,
      mockBallotStyle,
      gridPositions
    )
  ).toEqual(true);
});

test('voteMatchesGridPosition - does not match second cross-endorsed option when voting for first', () => {
  const vote: Candidate = {
    id: 'alice',
    name: 'Alice Johnson',
    partyIds: ['0', '1'],
  };

  const secondAliceGridPos = gridPositions[1];

  expect(
    voteMatchesGridPosition(
      vote,
      secondAliceGridPos,
      mockContest,
      mockBallotStyle,
      gridPositions
    )
  ).toEqual(false);
});

test('voteMatchesGridPosition - matches second cross-endorsed option', () => {
  const vote: Candidate = {
    id: 'alice',
    name: 'Alice Johnson',
    partyIds: ['2'],
  };

  const secondAliceGridPos = gridPositions[1];

  expect(
    voteMatchesGridPosition(
      vote,
      secondAliceGridPos,
      mockContest,
      mockBallotStyle,
      gridPositions
    )
  ).toEqual(true);

  const firstAliceGridPos = gridPositions[0];
  expect(
    voteMatchesGridPosition(
      vote,
      firstAliceGridPos,
      mockContest,
      mockBallotStyle,
      gridPositions
    )
  ).toEqual(false);
});

test('voteMatchesGridPosition - does not match wrong candidate', () => {
  const vote: Candidate = {
    id: 'bob',
    name: 'Bob Smith',
    partyIds: ['2'],
  };

  const aliceGridPos = gridPositions[0];

  expect(
    voteMatchesGridPosition(
      vote,
      aliceGridPos,
      mockContest,
      mockBallotStyle,
      gridPositions
    )
  ).toEqual(false);
});

test('voteMatchesGridPosition - handles candidate without partyIds', () => {
  const simpleContest: CandidateContest = {
    type: 'candidate',
    id: 'treasurer',
    districtId: 'district-1',
    title: 'Treasurer',
    seats: 1,
    candidates: [
      {
        id: 'charlie',
        name: 'Charlie Davis',
      },
    ],
    allowWriteIns: false,
  };

  const simpleBallotStyle: BallotStyle = {
    id: '2',
    groupId: '2',
    precincts: ['precinct-1'],
    districts: ['district-1'],
    orderedCandidatesByContest: {
      treasurer: [{ id: 'charlie' }],
    },
  };

  const simpleGridPositions: GridPositionOption[] = [
    {
      type: 'option',
      sheetNumber: 1,
      side: 'front',
      column: 2,
      row: 10,
      contestId: 'treasurer',
      optionId: 'charlie',
    },
  ];

  const vote: Candidate = {
    id: 'charlie',
    name: 'Charlie Davis',
  };

  expect(
    voteMatchesGridPosition(
      vote,
      simpleGridPositions[0],
      simpleContest,
      simpleBallotStyle,
      simpleGridPositions
    )
  ).toEqual(true);
});

test('voteMatchesGridPosition - works with multiple cross-endorsed candidates', () => {
  const complexContest: CandidateContest = {
    type: 'candidate',
    id: 'council',
    districtId: 'district-1',
    title: 'City Council',
    seats: 2,
    candidates: [
      {
        id: 'alice',
        name: 'Alice Johnson',
        partyIds: ['0', '1'],
      },
      {
        id: 'bob',
        name: 'Bob Smith',
        partyIds: ['1', '2'],
      },
    ],
    allowWriteIns: false,
  };

  const complexBallotStyle: BallotStyle = {
    id: '3',
    groupId: '3',
    precincts: ['precinct-1'],
    districts: ['district-1'],
    orderedCandidatesByContest: {
      council: [
        { id: 'alice', partyIds: ['0', '1'] },
        { id: 'alice', partyIds: ['2'] },
        { id: 'bob', partyIds: ['1', '2'] },
        { id: 'bob', partyIds: ['3'] },
      ],
    },
  };

  const complexGridPositions: GridPositionOption[] = [
    {
      type: 'option',
      sheetNumber: 1,
      side: 'front',
      column: 2,
      row: 10,
      contestId: 'council',
      optionId: 'alice',
    },
    {
      type: 'option',
      sheetNumber: 1,
      side: 'front',
      column: 2,
      row: 12,
      contestId: 'council',
      optionId: 'alice',
    },
    {
      type: 'option',
      sheetNumber: 1,
      side: 'front',
      column: 2,
      row: 14,
      contestId: 'council',
      optionId: 'bob',
    },
    {
      type: 'option',
      sheetNumber: 1,
      side: 'front',
      column: 2,
      row: 16,
      contestId: 'council',
      optionId: 'bob',
    },
  ];

  // Vote for Alice with parties 0,1 and Bob with parties 1,2
  const aliceVote: Candidate = {
    id: 'alice',
    name: 'Alice Johnson',
    partyIds: ['0', '1'],
  };

  const bobVote: Candidate = {
    id: 'bob',
    name: 'Bob Smith',
    partyIds: ['1', '2'],
  };

  // Alice should match first Alice position
  expect(
    voteMatchesGridPosition(
      aliceVote,
      complexGridPositions[0],
      complexContest,
      complexBallotStyle,
      complexGridPositions
    )
  ).toEqual(true);

  // Alice should not match second Alice position
  expect(
    voteMatchesGridPosition(
      aliceVote,
      complexGridPositions[1],
      complexContest,
      complexBallotStyle,
      complexGridPositions
    )
  ).toEqual(false);

  // Bob should match first Bob position
  expect(
    voteMatchesGridPosition(
      bobVote,
      complexGridPositions[2],
      complexContest,
      complexBallotStyle,
      complexGridPositions
    )
  ).toEqual(true);

  // Bob should not match second Bob position
  expect(
    voteMatchesGridPosition(
      bobVote,
      complexGridPositions[3],
      complexContest,
      complexBallotStyle,
      complexGridPositions
    )
  ).toEqual(false);
});
