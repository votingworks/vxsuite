import { expect, test } from 'vitest';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { Tabulation } from '@votingworks/types';
import {
  formatMarkScoreDistributionForLog,
  getCastVoteRecordAdjudicationFlags,
  MarkScoreDistribution,
  updateMarkScoreDistributionFromMarkScores,
} from './cast_vote_records';
import { CastVoteRecordAdjudicationFlags } from '..';

const electionDefinition =
  electionTwoPartyPrimaryFixtures.readElectionDefinition();

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
  ).toEqual<CastVoteRecordAdjudicationFlags>({
    isBlank: true,
    hasUndervote: true,
    hasOvervote: false,
    hasWriteIn: false,
  });
});

test('no status ballot', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(mockVotes(), electionDefinition)
  ).toEqual<CastVoteRecordAdjudicationFlags>({
    isBlank: false,
    hasUndervote: false,
    hasOvervote: false,
    hasWriteIn: false,
  });
});

test('undervote yes-no', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      mockVotes({ fishing: [] }),
      electionDefinition
    )
  ).toEqual<CastVoteRecordAdjudicationFlags>({
    isBlank: false,
    hasUndervote: true,
    hasOvervote: false,
    hasWriteIn: false,
  });
});

test('undervote candidate', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      mockVotes({ 'best-animal-mammal': [] }),
      electionDefinition
    )
  ).toEqual<CastVoteRecordAdjudicationFlags>({
    isBlank: false,
    hasUndervote: true,
    hasOvervote: false,
    hasWriteIn: false,
  });
});

test('overvote yes-no', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      mockVotes({ fishing: ['yes', 'no'] }),
      electionDefinition
    )
  ).toEqual<CastVoteRecordAdjudicationFlags>({
    isBlank: false,
    hasUndervote: false,
    hasOvervote: true,
    hasWriteIn: false,
  });
});

test('overvote candidate', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      mockVotes({
        'zoo-council-mammal': ['zebra', 'lion', 'kangaroo', 'elephant'],
      }),
      electionDefinition
    )
  ).toEqual<CastVoteRecordAdjudicationFlags>({
    isBlank: false,
    hasUndervote: false,
    hasOvervote: true,
    hasWriteIn: false,
  });
});

test('write-in', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      mockVotes({
        'best-animal-mammal': ['write-in-0'],
      }),
      electionDefinition
    )
  ).toEqual<CastVoteRecordAdjudicationFlags>({
    isBlank: false,
    hasUndervote: false,
    hasOvervote: false,
    hasWriteIn: true,
  });
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
  ).toEqual<CastVoteRecordAdjudicationFlags>({
    isBlank: false,
    hasUndervote: true,
    hasOvervote: true,
    hasWriteIn: true,
  });
});

test('updateMarkScoreDistributionFromMarkScores adds scores below 0.2 to correct buckets and ignores 0.0', () => {
  const dist: MarkScoreDistribution = {
    distribution: new Map<number, number>(),
    total: 0,
  };

  const markScores: Tabulation.MarkScores = {
    'contest-a': {
      'option-1': 0.01,
      'option-2': 0.15,
      'option-3': 0.0, // should be ignored
      'option-4': 0.21, // should not go in a bucket, but counts toward total
    },
  };

  updateMarkScoreDistributionFromMarkScores(dist, markScores);

  expect(dist.total).toEqual(3);
  expect(dist.distribution.get(0.01)).toEqual(1);
  expect(dist.distribution.get(0.15)).toEqual(1);
  expect(dist.distribution.get(0.0)).toBeUndefined();
  expect(dist.distribution.get(0.21)).toBeUndefined();

  updateMarkScoreDistributionFromMarkScores(dist, markScores);
  expect(dist.total).toEqual(6);
  expect(dist.distribution.get(0.01)).toEqual(2);
  expect(dist.distribution.get(0.15)).toEqual(2);
  expect(dist.distribution.get(0.0)).toBeUndefined();
  expect(dist.distribution.get(0.21)).toBeUndefined();
});

test('formatMarkScoreDistributionForLog formats a map of scores into readable bucket strings', () => {
  const map = new Map<number, number>([
    [0.01, 3],
    [0.15, 5],
  ]);

  const formatted = formatMarkScoreDistributionForLog(map);

  expect(JSON.parse(formatted)).toEqual({
    '0.01': 3,
    '0.15': 5,
  });
});
