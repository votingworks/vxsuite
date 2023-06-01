import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { replacePartyIdFilter } from './utils';

test('replacePartyIdFilter', () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;

  expect(
    replacePartyIdFilter(
      {
        partyIds: ['0'],
      },
      election
    )
  ).toEqual({
    ballotStyleIds: ['1M'],
  });

  expect(
    replacePartyIdFilter(
      {
        partyIds: ['0', '1'],
      },
      election
    )
  ).toEqual({
    ballotStyleIds: ['1M', '2F'],
  });

  // doesn't touch other filters when no party id
  expect(
    replacePartyIdFilter(
      {
        ballotStyleIds: ['1M', '2F'],
        votingMethods: ['absentee'],
      },
      election
    )
  ).toEqual({
    ballotStyleIds: ['1M', '2F'],
    votingMethods: ['absentee'],
  });

  // intersects explicit ballot style ids and implied ballot style ids
  expect(
    replacePartyIdFilter(
      {
        partyIds: ['0'],
        ballotStyleIds: ['1M', '2F'],
      },
      election
    )
  ).toEqual({
    ballotStyleIds: ['1M'],
  });
});
