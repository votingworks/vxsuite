import { expect, test } from 'vitest';
import {
  BallotStyle,
  BallotStyleId,
  Election,
  PartyId,
} from '@votingworks/types';
import { readElectionTwoPartyPrimary } from '@votingworks/fixtures';
import { detectCrossoverVoting } from './crossover_voting';

const baseElection = readElectionTwoPartyPrimary();

function makeOpenPrimary(election: Election): Election {
  return {
    ...election,
    ballotStyles: [
      {
        id: '1' as BallotStyleId,
        groupId: '1',
        precincts: election.precincts.map((p) => p.id),
        districts: election.districts.map((d) => d.id),
      } as BallotStyle,
    ],
  };
}

const openPrimaryElection = makeOpenPrimary(baseElection);

// Get some contest IDs for testing
const mammalPartyId = baseElection.parties.find(
  (p) => p.name === 'Mammal'
)!.id;
const fishPartyId = baseElection.parties.find((p) => p.name === 'Fish')!.id;

const mammalContest = openPrimaryElection.contests.find(
  (c) => c.type === 'candidate' && c.partyId === mammalPartyId
)!;
const fishContest = openPrimaryElection.contests.find(
  (c) => c.type === 'candidate' && c.partyId === fishPartyId
)!;
const nonpartisanContest = openPrimaryElection.contests.find(
  (c) => c.type === 'yesno'
)!;

test('returns no crossover for non-open-primary elections', () => {
  const result = detectCrossoverVoting(
    { [mammalContest.id]: [{ id: 'a', name: 'A' }] },
    baseElection
  );
  expect(result).toEqual({ isCrossover: false, votedPartyIds: [] });
});

test('single party votes - no crossover', () => {
  const result = detectCrossoverVoting(
    { [mammalContest.id]: [{ id: 'a', name: 'A' }] },
    openPrimaryElection
  );
  expect(result.isCrossover).toEqual(false);
  expect(result.votedPartyIds).toEqual([mammalPartyId]);
});

test('votes in multiple parties - crossover detected', () => {
  const result = detectCrossoverVoting(
    {
      [mammalContest.id]: [{ id: 'a', name: 'A' }],
      [fishContest.id]: [{ id: 'b', name: 'B' }],
    },
    openPrimaryElection
  );
  expect(result.isCrossover).toEqual(true);
  expect(new Set(result.votedPartyIds)).toEqual(
    new Set([mammalPartyId, fishPartyId] as PartyId[])
  );
});

test('nonpartisan only - no crossover, no party IDs', () => {
  const result = detectCrossoverVoting(
    { [nonpartisanContest.id]: ['option-yes'] },
    openPrimaryElection
  );
  expect(result).toEqual({ isCrossover: false, votedPartyIds: [] });
});

test('empty votes - no crossover', () => {
  const result = detectCrossoverVoting({}, openPrimaryElection);
  expect(result).toEqual({ isCrossover: false, votedPartyIds: [] });
});

test('contests with empty vote arrays - no crossover', () => {
  const result = detectCrossoverVoting(
    { [mammalContest.id]: [], [fishContest.id]: [] },
    openPrimaryElection
  );
  expect(result).toEqual({ isCrossover: false, votedPartyIds: [] });
});
