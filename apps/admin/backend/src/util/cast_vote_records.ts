import {
  AdjudicationReason,
  AnyContest,
  ContestOptionId,
  ElectionDefinition,
  MarkThresholds,
  Tabulation,
} from '@votingworks/types';
import { CachedElectionLookups, hasCrossoverVote } from '@votingworks/utils';
import {
  CastVoteRecordAdjudicationFlags,
  CvrContestTag,
  WriteInRecord,
} from '../types';

/**
 * Returns the number of allowed votes for the contest
 */
export function getNumberVotesAllowed(contest: AnyContest): number {
  if (contest.type === 'yesno') {
    return 1;
  }
  if (contest.type === 'straight-party') {
    return 1;
  }

  return contest.seats;
}

/**
 * Determines the summary adjudication flags for a cast vote record.
 */
export function getCastVoteRecordAdjudicationFlags(
  electionDefinition: ElectionDefinition,
  votes: Tabulation.Votes,
  writeInCount: number,
  markScores?: Tabulation.MarkScores,
  markThresholds?: MarkThresholds
): CastVoteRecordAdjudicationFlags {
  let isBlank = true;
  let hasUndervote = false;
  let hasOvervote = false;
  let hasMarginalMark = false;

  for (const [contestId, optionIds] of Object.entries(votes)) {
    const contest = CachedElectionLookups.getContestById(
      electionDefinition,
      contestId
    );

    if (optionIds.length > 0) {
      isBlank = false;
    }

    const votesAllowed = getNumberVotesAllowed(contest);

    if (optionIds.length < votesAllowed) {
      hasUndervote = true;
    }

    if (optionIds.length > votesAllowed) {
      hasOvervote = true;
    }
  }

  // Write-ins are detected from write-in records (which include unmarked
  // write-ins), not from votes which only contain marked write-ins
  const hasWriteIn = writeInCount > 0;

  if (markScores && markThresholds) {
    hasMarginalMark = Object.values(markScores).some((contestMarkScores) =>
      Object.values(contestMarkScores).some(
        (score) =>
          score >= markThresholds.marginal && score < markThresholds.definite
      )
    );
  }

  return {
    isBlank,
    hasUndervote,
    hasOvervote,
    hasWriteIn,
    hasMarginalMark,
    hasCrossoverVote: hasCrossoverVote(electionDefinition.election, votes),
  };
}

/**
 * Determines whether a CVR needs adjudication based on its flags and the
 * election's adjudication reasons. Write-ins and crossover votes always need
 * adjudication; other flags are gated on system settings.
 */
export function doesCvrNeedAdjudication(
  adjudicationFlags: CastVoteRecordAdjudicationFlags,
  adminAdjudicationReasons: AdjudicationReason[]
): boolean {
  return (
    adjudicationFlags.hasWriteIn ||
    adjudicationFlags.hasCrossoverVote ||
    (adjudicationFlags.hasMarginalMark &&
      adminAdjudicationReasons.includes(AdjudicationReason.MarginalMark)) ||
    (adjudicationFlags.hasOvervote &&
      adminAdjudicationReasons.includes(AdjudicationReason.Overvote)) ||
    (adjudicationFlags.hasUndervote &&
      adminAdjudicationReasons.includes(AdjudicationReason.Undervote)) ||
    (adjudicationFlags.isBlank &&
      adminAdjudicationReasons.includes(AdjudicationReason.BlankBallot))
  );
}

/**
 * Derives a contest-level adjudication tag from CVR data. Returns undefined
 * if the contest does not need adjudication.
 */
export function deriveCvrContestTag({
  contest,
  votes,
  writeInRecords,
  markScores,
  markThresholds,
  adminAdjudicationReasons,
}: {
  contest: AnyContest;
  votes: ContestOptionId[];
  writeInRecords: WriteInRecord[];
  markScores?: Record<ContestOptionId, number>;
  markThresholds: MarkThresholds;
  adminAdjudicationReasons: AdjudicationReason[];
}): CvrContestTag | undefined {
  const hasWriteIn = writeInRecords.some(
    (r) => r.contestId === contest.id && !r.isUnmarked
  );
  const hasUnmarkedWriteIn = writeInRecords.some(
    (r) => r.contestId === contest.id && r.isUnmarked
  );

  const hasMarginalMark =
    adminAdjudicationReasons.includes(AdjudicationReason.MarginalMark) &&
    markScores !== undefined &&
    Object.values(markScores).some(
      (score) =>
        score >= markThresholds.marginal && score < markThresholds.definite
    );

  const votesAllowed = getNumberVotesAllowed(contest);
  const hasOvervote =
    adminAdjudicationReasons.includes(AdjudicationReason.Overvote) &&
    votes.length > votesAllowed;
  const hasUndervote =
    adminAdjudicationReasons.includes(AdjudicationReason.Undervote) &&
    votes.length < votesAllowed;

  const needsAdjudication =
    hasWriteIn ||
    hasUnmarkedWriteIn ||
    hasMarginalMark ||
    hasOvervote ||
    hasUndervote;

  if (!needsAdjudication) {
    return undefined;
  }

  return {
    hasWriteIn,
    hasUnmarkedWriteIn,
    hasMarginalMark,
    hasOvervote,
    hasUndervote,
  };
}

/**
 * For logging, used to track mark score distribution on cvr import
 */
export interface MarkScoreDistribution {
  distribution: Map<number, number>;
  total: number;
}

/**
 * Updates the score distribution with a new set of cvr mark scores.
 * Buckets are 0.01 increments, only recording marks with score <= 0.2.
 */
export function updateMarkScoreDistributionFromMarkScores(
  scoreDist: MarkScoreDistribution,
  markScores: Tabulation.MarkScores
): void {
  for (const contestMarkScores of Object.values(markScores)) {
    for (const score of Object.values(contestMarkScores)) {
      if (score > 0.0) {
        // eslint-disable-next-line no-param-reassign
        scoreDist.total += 1;
        if (score <= 0.2) {
          const bucket = Math.floor(score * 100) / 100;
          scoreDist.distribution.set(
            bucket,
            (scoreDist.distribution.get(bucket) ?? 0) + 1
          );
        }
      }
    }
  }
}

/**
 * Formats the score distribution for logging.
 * i.e. "0.01": 15, "0.02": 100...
 */
export function formatMarkScoreDistributionForLog(
  distribution: Map<number, number>
): string {
  return JSON.stringify(
    Object.fromEntries(
      [...distribution].map(([start, count]) => [start.toFixed(2), count])
    )
  );
}
