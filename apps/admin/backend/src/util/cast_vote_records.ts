import {
  AdjudicationReason,
  AnyContest,
  ContestId,
  ContestOptionId,
  ElectionDefinition,
  Id,
  MarkThresholds,
  Tabulation,
} from '@votingworks/types';
import { CachedElectionLookups } from '@votingworks/utils';
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

  return contest.seats;
}

/**
 * Determines the summary adjudication flags for a cast vote record.
 */
export function getCastVoteRecordAdjudicationFlags(
  votes: Tabulation.Votes,
  electionDefinition: ElectionDefinition,
  markScores?: Tabulation.MarkScores,
  markThresholds?: MarkThresholds
): CastVoteRecordAdjudicationFlags {
  let isBlank = true;
  let hasUndervote = false;
  let hasOvervote = false;
  let hasWriteIn = false;
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

    if (
      optionIds.some((optionId) =>
        optionId.startsWith(Tabulation.GENERIC_WRITE_IN_ID)
      )
    ) {
      hasWriteIn = true;
    }
  }

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
  };
}

/**
 * Determines whether a CVR needs adjudication based on its flags and the
 * election's adjudication reasons. Write-ins always need adjudication;
 * other flags are gated on system settings.
 */
export function doesCvrNeedAdjudication(
  adjudicationFlags: CastVoteRecordAdjudicationFlags,
  adminAdjudicationReasons: AdjudicationReason[]
): boolean {
  return (
    adjudicationFlags.hasWriteIn ||
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
  cvrId,
  contestId,
  contest,
  votes,
  adjudicatedVotes,
  writeInRecords,
  markScores,
  markThresholds,
  adminAdjudicationReasons,
}: {
  cvrId: Id;
  contestId: ContestId;
  contest: AnyContest;
  votes: ContestOptionId[];
  adjudicatedVotes?: ContestOptionId[];
  writeInRecords: WriteInRecord[];
  markScores?: Record<ContestOptionId, number>;
  markThresholds: MarkThresholds;
  adminAdjudicationReasons: AdjudicationReason[];
}): CvrContestTag | undefined {
  const hasWriteIn = writeInRecords.some(
    (r) => r.contestId === contestId && !r.isUnmarked
  );
  const hasUnmarkedWriteIn = writeInRecords.some(
    (r) => r.contestId === contestId && r.isUnmarked
  );

  let hasMarginalMark =
    adminAdjudicationReasons.includes(AdjudicationReason.MarginalMark) &&
    markScores !== undefined &&
    Object.values(markScores).some(
      (score) =>
        score >= markThresholds.marginal && score < markThresholds.definite
    );

  const votesAllowed = getNumberVotesAllowed(contest);
  let hasOvervote =
    adminAdjudicationReasons.includes(AdjudicationReason.Overvote) &&
    votes.length > votesAllowed;
  let hasUndervote =
    adminAdjudicationReasons.includes(AdjudicationReason.Undervote) &&
    votes.length < votesAllowed;

  // If adjudicated votes differ from scanned votes for non-write-in
  // options, the user corrected a mark the scanner misread
  if (adjudicatedVotes) {
    const scannedCandidateVotes = new Set(
      votes.filter((v) => !v.startsWith(Tabulation.GENERIC_WRITE_IN_ID))
    );
    const adjudicatedCandidateVotes = new Set(
      adjudicatedVotes.filter(
        (v) => !v.startsWith(Tabulation.GENERIC_WRITE_IN_ID)
      )
    );
    const candidateVotesChanged =
      scannedCandidateVotes.size !== adjudicatedCandidateVotes.size ||
      [...scannedCandidateVotes].some((v) => !adjudicatedCandidateVotes.has(v));

    if (candidateVotesChanged) {
      hasMarginalMark = true;
    }

    // Recalculate over/undervote based on adjudicated state
    hasOvervote = hasOvervote || adjudicatedVotes.length > votesAllowed;
    hasUndervote = hasUndervote || adjudicatedVotes.length < votesAllowed;
  }

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
    cvrId,
    contestId,
    isResolved: adjudicatedVotes !== undefined,
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
