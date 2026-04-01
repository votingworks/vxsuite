import { expect, test } from 'vitest';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import {
  AdjudicationReason,
  MarkThresholds,
  Tabulation,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import {
  deriveCvrContestTag,
  doesCvrNeedAdjudication,
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
      electionDefinition,
      {
        'best-animal-mammal': [],
        'zoo-council-mammal': [],
        'new-zoo-either': [],
        'new-zoo-pick': [],
        fishing: [],
      },
      0
    )
  ).toEqual<CastVoteRecordAdjudicationFlags>({
    isBlank: true,
    hasUndervote: true,
    hasOvervote: false,
    hasWriteIn: false,
    hasMarginalMark: false,
  });
});

test('no status ballot', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(electionDefinition, mockVotes(), 0)
  ).toEqual<CastVoteRecordAdjudicationFlags>({
    isBlank: false,
    hasUndervote: false,
    hasOvervote: false,
    hasWriteIn: false,
    hasMarginalMark: false,
  });
});

test('undervote yes-no', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      electionDefinition,
      mockVotes({ fishing: [] }),
      0
    )
  ).toEqual<CastVoteRecordAdjudicationFlags>({
    isBlank: false,
    hasUndervote: true,
    hasOvervote: false,
    hasWriteIn: false,
    hasMarginalMark: false,
  });
});

test('undervote candidate', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      electionDefinition,
      mockVotes({ 'best-animal-mammal': [] }),
      0
    )
  ).toEqual<CastVoteRecordAdjudicationFlags>({
    isBlank: false,
    hasUndervote: true,
    hasOvervote: false,
    hasWriteIn: false,
    hasMarginalMark: false,
  });
});

test('overvote yes-no', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      electionDefinition,
      mockVotes({ fishing: ['yes', 'no'] }),
      0
    )
  ).toEqual<CastVoteRecordAdjudicationFlags>({
    isBlank: false,
    hasUndervote: false,
    hasOvervote: true,
    hasWriteIn: false,
    hasMarginalMark: false,
  });
});

test('overvote candidate', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      electionDefinition,
      mockVotes({
        'zoo-council-mammal': ['zebra', 'lion', 'kangaroo', 'elephant'],
      }),
      0
    )
  ).toEqual<CastVoteRecordAdjudicationFlags>({
    isBlank: false,
    hasUndervote: false,
    hasOvervote: true,
    hasWriteIn: false,
    hasMarginalMark: false,
  });
});

test('write-in', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      electionDefinition,
      mockVotes({
        'best-animal-mammal': ['write-in-0'],
      }),
      1
    )
  ).toEqual<CastVoteRecordAdjudicationFlags>({
    isBlank: false,
    hasUndervote: false,
    hasOvervote: false,
    hasWriteIn: true,
    hasMarginalMark: false,
  });
});

test('unmarked write-in sets hasWriteIn', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(electionDefinition, mockVotes(), 1)
  ).toEqual<CastVoteRecordAdjudicationFlags>({
    isBlank: false,
    hasUndervote: false,
    hasOvervote: false,
    hasWriteIn: true,
    hasMarginalMark: false,
  });
});

test('multiple flags', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      electionDefinition,
      mockVotes({
        'zoo-council-mammal': ['write-in-0'],
        fishing: ['yes', 'no'],
      }),
      1
    )
  ).toEqual<CastVoteRecordAdjudicationFlags>({
    isBlank: false,
    hasUndervote: true,
    hasOvervote: true,
    hasWriteIn: true,
    hasMarginalMark: false,
  });
});

test('marginal mark', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      electionDefinition,
      mockVotes(),
      0,
      { 'best-animal-mammal': { fox: 0.15 } },
      { marginal: 0.12, definite: 0.2, writeInTextArea: 0.12 }
    )
  ).toEqual<CastVoteRecordAdjudicationFlags>({
    isBlank: false,
    hasUndervote: false,
    hasOvervote: false,
    hasWriteIn: false,
    hasMarginalMark: true,
  });
});

test('no marginal mark when scores are above definite', () => {
  expect(
    getCastVoteRecordAdjudicationFlags(
      electionDefinition,
      mockVotes(),
      0,
      { 'best-animal-mammal': { fox: 0.5 } },
      { marginal: 0.12, definite: 0.2, writeInTextArea: 0.12 }
    )
  ).toEqual<CastVoteRecordAdjudicationFlags>({
    isBlank: false,
    hasUndervote: false,
    hasOvervote: false,
    hasWriteIn: false,
    hasMarginalMark: false,
  });
});

const candidateContest = assertDefined(
  electionDefinition.election.contests.find(
    (c) => c.id === 'zoo-council-mammal'
  )
);
const DEFAULT_THRESHOLDS: MarkThresholds = {
  marginal: 0.05,
  definite: 0.07,
  writeInTextArea: 0.05,
};

// eslint-disable-next-line vx/gts-object-literal-types
const BASE_ARGS = {
  cvrId: 'cvr-1',
  contest: candidateContest,
  writeInRecords: [],
  markThresholds: DEFAULT_THRESHOLDS,
  adminAdjudicationReasons: [],
};

test('deriveCvrContestTag - returns undefined for normal contest', () => {
  expect(
    deriveCvrContestTag({
      ...BASE_ARGS,
      votes: ['zebra', 'lion', 'kangaroo'],
    })
  ).toBeUndefined();
});

test('deriveCvrContestTag - overvote with reason enabled', () => {
  const tag = deriveCvrContestTag({
    ...BASE_ARGS,
    votes: ['zebra', 'lion', 'kangaroo', 'elephant'],
    adminAdjudicationReasons: [AdjudicationReason.Overvote],
  });
  expect(tag).toBeDefined();
  expect(tag?.hasOvervote).toEqual(true);
  expect(tag?.isResolved).toEqual(false);
});

test('deriveCvrContestTag - overvote with reason disabled', () => {
  expect(
    deriveCvrContestTag({
      ...BASE_ARGS,
      votes: ['zebra', 'lion', 'kangaroo', 'elephant'],
    })
  ).toBeUndefined();
});

test('deriveCvrContestTag - undervote with reason enabled', () => {
  const tag = deriveCvrContestTag({
    ...BASE_ARGS,
    votes: ['zebra'],
    adminAdjudicationReasons: [AdjudicationReason.Undervote],
  });
  expect(tag).toBeDefined();
  expect(tag?.hasUndervote).toEqual(true);
});

test('deriveCvrContestTag - undervote with reason disabled', () => {
  expect(
    deriveCvrContestTag({
      ...BASE_ARGS,
      votes: ['zebra'],
    })
  ).toBeUndefined();
});

test('deriveCvrContestTag - marginal mark with reason enabled', () => {
  const tag = deriveCvrContestTag({
    ...BASE_ARGS,
    votes: ['zebra', 'lion', 'kangaroo'],
    markScores: { zebra: 0.5, lion: 0.5, kangaroo: 0.06 },
    adminAdjudicationReasons: [AdjudicationReason.MarginalMark],
  });
  expect(tag).toBeDefined();
  expect(tag?.hasMarginalMark).toEqual(true);
});

test('deriveCvrContestTag - marginal mark with reason disabled', () => {
  expect(
    deriveCvrContestTag({
      ...BASE_ARGS,
      votes: ['zebra', 'lion', 'kangaroo'],
      markScores: { zebra: 0.5, lion: 0.5, kangaroo: 0.06 },
    })
  ).toBeUndefined();
});

test('deriveCvrContestTag - adjudicated votes that differ set hasMarginalMark', () => {
  const tag = deriveCvrContestTag({
    ...BASE_ARGS,
    votes: ['zebra', 'lion', 'kangaroo'],
    adjudicatedVotes: ['zebra', 'lion', 'elephant'],
  });
  expect(tag).toBeDefined();
  expect(tag?.hasMarginalMark).toEqual(true);
  expect(tag?.isResolved).toEqual(true);
});

test('deriveCvrContestTag - write-in only vote change does not set hasMarginalMark', () => {
  const tag = deriveCvrContestTag({
    ...BASE_ARGS,
    votes: ['zebra', 'lion', 'write-in-0'],
    adjudicatedVotes: ['zebra', 'lion'],
    adminAdjudicationReasons: [AdjudicationReason.Undervote],
  });
  expect(tag).toBeDefined();
  expect(tag?.hasMarginalMark).toEqual(false);
  expect(tag?.hasUndervote).toEqual(true);
});

test('deriveCvrContestTag - adjudicated votes create undervote', () => {
  const tag = deriveCvrContestTag({
    ...BASE_ARGS,
    votes: ['zebra', 'lion', 'kangaroo'],
    adjudicatedVotes: ['zebra'],
  });
  expect(tag).toBeDefined();
  expect(tag?.hasUndervote).toEqual(true);
  expect(tag?.hasMarginalMark).toEqual(true);
});

test('deriveCvrContestTag - adjudicated votes create overvote', () => {
  const tag = deriveCvrContestTag({
    ...BASE_ARGS,
    votes: ['zebra', 'lion', 'kangaroo'],
    adjudicatedVotes: ['zebra', 'lion', 'kangaroo', 'elephant'],
  });
  expect(tag).toBeDefined();
  expect(tag?.hasOvervote).toEqual(true);
});

test('deriveCvrContestTag - isResolved when adjudicatedVotes present', () => {
  const tag = deriveCvrContestTag({
    ...BASE_ARGS,
    votes: ['zebra', 'lion', 'kangaroo'],
    adjudicatedVotes: ['zebra', 'lion', 'kangaroo'],
    adminAdjudicationReasons: [AdjudicationReason.Undervote],
  });
  expect(tag).toBeUndefined();
});

const NO_FLAGS: CastVoteRecordAdjudicationFlags = {
  isBlank: false,
  hasOvervote: false,
  hasUndervote: false,
  hasWriteIn: false,
  hasMarginalMark: false,
};

test('doesCvrNeedAdjudication - write-in always needs adjudication', () => {
  expect(
    doesCvrNeedAdjudication({ ...NO_FLAGS, hasWriteIn: true }, [])
  ).toEqual(true);
});

test('doesCvrNeedAdjudication - marginal mark with reason enabled', () => {
  expect(
    doesCvrNeedAdjudication({ ...NO_FLAGS, hasMarginalMark: true }, [
      AdjudicationReason.MarginalMark,
    ])
  ).toEqual(true);
});

test('doesCvrNeedAdjudication - marginal mark with reason disabled', () => {
  expect(
    doesCvrNeedAdjudication({ ...NO_FLAGS, hasMarginalMark: true }, [])
  ).toEqual(false);
});

test('doesCvrNeedAdjudication - overvote with reason enabled', () => {
  expect(
    doesCvrNeedAdjudication({ ...NO_FLAGS, hasOvervote: true }, [
      AdjudicationReason.Overvote,
    ])
  ).toEqual(true);
});

test('doesCvrNeedAdjudication - overvote with reason disabled', () => {
  expect(
    doesCvrNeedAdjudication({ ...NO_FLAGS, hasOvervote: true }, [])
  ).toEqual(false);
});

test('doesCvrNeedAdjudication - undervote with reason enabled', () => {
  expect(
    doesCvrNeedAdjudication({ ...NO_FLAGS, hasUndervote: true }, [
      AdjudicationReason.Undervote,
    ])
  ).toEqual(true);
});

test('doesCvrNeedAdjudication - undervote with reason disabled', () => {
  expect(
    doesCvrNeedAdjudication({ ...NO_FLAGS, hasUndervote: true }, [])
  ).toEqual(false);
});

test('doesCvrNeedAdjudication - blank ballot with reason enabled', () => {
  expect(
    doesCvrNeedAdjudication({ ...NO_FLAGS, isBlank: true }, [
      AdjudicationReason.BlankBallot,
    ])
  ).toEqual(true);
});

test('doesCvrNeedAdjudication - blank ballot with reason disabled', () => {
  expect(doesCvrNeedAdjudication({ ...NO_FLAGS, isBlank: true }, [])).toEqual(
    false
  );
});

test('doesCvrNeedAdjudication - no flags', () => {
  expect(doesCvrNeedAdjudication(NO_FLAGS, [])).toEqual(false);
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
