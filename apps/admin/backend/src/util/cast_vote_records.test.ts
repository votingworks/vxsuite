import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { typedAs } from '@votingworks/basics';
import { Tabulation } from '@votingworks/types';
import { getCastVoteRecordAdjudicationFlags } from './cast_vote_records';
import { CastVoteRecordAdjudicationFlags } from '..';

const { electionDefinition } = electionTwoPartyPrimaryFixtures;

const noStatusVotes: Tabulation.Votes = {
  'best-animal-mammal': ['fox'],
  'zoo-council-mammal': ['zebra', 'lion', 'kangaroo'],
  'new-zoo-either': ['yes'],
  'new-zoo-pick': ['no'],
  fishing: ['yes'],
};

function mockVotes(partialVotes: Tabulation.Votes = {}) {
  return {
    ...noStatusVotes,
    ...partialVotes,
  };
}

test('blank ballot', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      {
        'best-animal-mammal': [],
        'zoo-council-mammal': [],
        'new-zoo-either': [],
        'new-zoo-pick': [],
        fishing: [],
      },
      electionDefinition
    )
  ).toEqual(
    typedAs<CastVoteRecordAdjudicationFlags>({
      isBlank: true,
      hasUndervote: true,
      hasOvervote: false,
      hasWriteIn: false,
    })
  );
});

test('no status ballot', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(mockVotes(), electionDefinition)
  ).toEqual(
    typedAs<CastVoteRecordAdjudicationFlags>({
      isBlank: false,
      hasUndervote: false,
      hasOvervote: false,
      hasWriteIn: false,
    })
  );
});

test('undervote yes-no', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      mockVotes({ fishing: [] }),
      electionDefinition
    )
  ).toEqual(
    typedAs<CastVoteRecordAdjudicationFlags>({
      isBlank: false,
      hasUndervote: true,
      hasOvervote: false,
      hasWriteIn: false,
    })
  );
});

test('undervote candidate', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      mockVotes({ 'best-animal-mammal': [] }),
      electionDefinition
    )
  ).toEqual(
    typedAs<CastVoteRecordAdjudicationFlags>({
      isBlank: false,
      hasUndervote: true,
      hasOvervote: false,
      hasWriteIn: false,
    })
  );
});

test('overvote yes-no', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      mockVotes({ fishing: ['yes', 'no'] }),
      electionDefinition
    )
  ).toEqual(
    typedAs<CastVoteRecordAdjudicationFlags>({
      isBlank: false,
      hasUndervote: false,
      hasOvervote: true,
      hasWriteIn: false,
    })
  );
});

test('overvote candidate', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      mockVotes({
        'zoo-council-mammal': ['zebra', 'lion', 'kangaroo', 'elephant'],
      }),
      electionDefinition
    )
  ).toEqual(
    typedAs<CastVoteRecordAdjudicationFlags>({
      isBlank: false,
      hasUndervote: false,
      hasOvervote: true,
      hasWriteIn: false,
    })
  );
});

test('write-in', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      mockVotes({
        'best-animal-mammal': ['write-in-0'],
      }),
      electionDefinition
    )
  ).toEqual(
    typedAs<CastVoteRecordAdjudicationFlags>({
      isBlank: false,
      hasUndervote: false,
      hasOvervote: false,
      hasWriteIn: true,
    })
  );
});

test('multiple flags', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      mockVotes({
        'zoo-council-mammal': ['write-in-0'],
        fishing: ['yes', 'no'],
      }),
      electionDefinition
    )
  ).toEqual(
    typedAs<CastVoteRecordAdjudicationFlags>({
      isBlank: false,
      hasUndervote: true,
      hasOvervote: true,
      hasWriteIn: true,
    })
  );
});
