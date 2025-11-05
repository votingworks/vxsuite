import { expect, test } from 'vitest';
import { Candidate, GridPositionOption } from '@votingworks/types';
import { voteMatchesGridPosition } from './vote_matching';

const gridPositions: GridPositionOption[] = [
  {
    type: 'option',
    sheetNumber: 1,
    side: 'front',
    column: 2,
    row: 10,
    contestId: 'mayor',
    optionId: 'alice', // First Alice bubble (parties 0,1)
    partyIds: ['0', '1'],
  },
  {
    type: 'option',
    sheetNumber: 1,
    side: 'front',
    column: 2,
    row: 12,
    contestId: 'mayor',
    optionId: 'alice', // Second Alice bubble (party 2)
    partyIds: ['2'],
  },
  {
    type: 'option',
    sheetNumber: 1,
    side: 'front',
    column: 2,
    row: 14,
    contestId: 'mayor',
    optionId: 'bob',
    partyIds: ['2'],
  },
];

test('voteMatchesGridPosition - matches non-cross-endorsed candidate', () => {
  const vote: Candidate = {
    id: 'bob',
    name: 'Bob Smith',
    partyIds: ['2'],
  };

  const bobGridPos = gridPositions[2];

  expect(voteMatchesGridPosition(vote, bobGridPos, gridPositions)).toEqual(
    true
  );
});

test('voteMatchesGridPosition - matches first cross-endorsed option', () => {
  const vote: Candidate = {
    id: 'alice',
    name: 'Alice Johnson',
    partyIds: ['0', '1'],
  };

  const firstAliceGridPos = gridPositions[0];

  expect(
    voteMatchesGridPosition(vote, firstAliceGridPos, gridPositions)
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
    voteMatchesGridPosition(vote, secondAliceGridPos, gridPositions)
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
    voteMatchesGridPosition(vote, secondAliceGridPos, gridPositions)
  ).toEqual(true);

  const firstAliceGridPos = gridPositions[0];
  expect(
    voteMatchesGridPosition(vote, firstAliceGridPos, gridPositions)
  ).toEqual(false);
});

test('voteMatchesGridPosition - does not match wrong candidate', () => {
  const vote: Candidate = {
    id: 'bob',
    name: 'Bob Smith',
    partyIds: ['2'],
  };

  const aliceGridPos = gridPositions[0];

  expect(voteMatchesGridPosition(vote, aliceGridPos, gridPositions)).toEqual(
    false
  );
});

test('voteMatchesGridPosition - handles candidate without partyIds', () => {
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
    voteMatchesGridPosition(vote, simpleGridPositions[0], simpleGridPositions)
  ).toEqual(true);
});

test('voteMatchesGridPosition - works with multiple cross-endorsed candidates', () => {
  const complexGridPositions: GridPositionOption[] = [
    {
      type: 'option',
      sheetNumber: 1,
      side: 'front',
      column: 2,
      row: 10,
      contestId: 'council',
      optionId: 'alice',
      partyIds: ['0', '1'],
    },
    {
      type: 'option',
      sheetNumber: 1,
      side: 'front',
      column: 2,
      row: 12,
      contestId: 'council',
      optionId: 'alice',
      partyIds: ['2'],
    },
    {
      type: 'option',
      sheetNumber: 1,
      side: 'front',
      column: 2,
      row: 14,
      contestId: 'council',
      optionId: 'bob',
      partyIds: ['1', '2'],
    },
    {
      type: 'option',
      sheetNumber: 1,
      side: 'front',
      column: 2,
      row: 16,
      contestId: 'council',
      optionId: 'bob',
      partyIds: ['0'],
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
      complexGridPositions
    )
  ).toEqual(true);

  // Alice should not match second Alice position
  expect(
    voteMatchesGridPosition(
      aliceVote,
      complexGridPositions[1],
      complexGridPositions
    )
  ).toEqual(false);

  // Bob should match first Bob position
  expect(
    voteMatchesGridPosition(
      bobVote,
      complexGridPositions[2],
      complexGridPositions
    )
  ).toEqual(true);

  // Bob should not match second Bob position
  expect(
    voteMatchesGridPosition(
      bobVote,
      complexGridPositions[3],
      complexGridPositions
    )
  ).toEqual(false);
});
