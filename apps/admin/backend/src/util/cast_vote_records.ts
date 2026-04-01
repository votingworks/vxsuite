import {
  AdjudicationReason,
  Admin,
  AnyContest,
  ContestId,
  ContestOptionId,
  ElectionDefinition,
  Id,
  MarkThresholds,
  Tabulation,
} from '@votingworks/types';
import { CastVoteRecordWriteIn } from '@votingworks/utils';
import {
  CastVoteRecordAdjudicationFlags,
  CvrContestTag,
  WriteInRecord,
} from '../types';
import { deepEqual, throwIllegalValue, unique } from '@votingworks/basics/src';

/**
 * Returns the number of allowed votes for the contest
 */
export function getNumberVotesAllowed(contest: AnyContest): number {
  if (contest.type === 'yesno') {
    return 1;
  }

  return contest.seats;
}

const CONTEST_ADJUDICATION_FLAGS = [
  'hasOvervote',
  'hasUndervote',
  'hasMarginalMark',
  'hasWriteIn',
  'hasUnmarkedWriteIn',
] as const;
type ContestAdjudicationFlag = (typeof CONTEST_ADJUDICATION_FLAGS)[number];

function detectContestAdjudicationFlags({
  contest,
  votes,
  writeIns,
  markScores,
  markThresholds,
}: {
  contest: AnyContest;
  votes: ContestOptionId[];
  writeIns: { isUnmarked?: boolean }[];
  markScores?: Record<ContestOptionId, number>;
  markThresholds: MarkThresholds;
}): ContestAdjudicationFlag[] {
  return CONTEST_ADJUDICATION_FLAGS.filter((flag) => {
    switch (flag) {
      case 'hasOvervote':
        return votes.length > getNumberVotesAllowed(contest);
      case 'hasUndervote':
        return votes.length < getNumberVotesAllowed(contest);
      case 'hasMarginalMark':
        return (
          markScores !== undefined &&
          Object.values(markScores).some(
            (score) =>
              score >= markThresholds.marginal &&
              score < markThresholds.definite
          )
        );
      case 'hasWriteIn':
        return writeIns.some((r) => !r.isUnmarked);
      case 'hasUnmarkedWriteIn':
        return writeIns.some((r) => r.isUnmarked);
      default:
        return throwIllegalValue(flag);
    }
  });
}

/**
 * Determines the summary adjudication flags for a cast vote record.
 */
export function getCastVoteRecordAdjudicationFlags(
  votes: Tabulation.Votes,
  electionDefinition: ElectionDefinition,
  writeIns: CastVoteRecordWriteIn[],
  markThresholds: MarkThresholds,
  markScores?: Tabulation.MarkScores
): CastVoteRecordAdjudicationFlags {
  const contestAdjudicationFlags = unique(
    electionDefinition.election.contests.map((contest) => {
      return detectContestAdjudicationFlags({
        contest,
        votes: votes[contest.id] ?? [],
        writeIns: writeIns.filter((r) => r.contestId === contest.id),
        markScores: markScores ? markScores[contest.id] : undefined,
        markThresholds: markThresholds,
      }).map((flag) => (flag === 'hasUnmarkedWriteIn' ? 'hasWriteIn' : flag));
    })
  );

  const isBlank = Object.values(votes).every(
    (optionIds) => optionIds.length === 0
  );

  return {
    isBlank,
    ...Object.fromEntries(contestAdjudicationFlags.map((flag) => [flag, true])),
  };
}

function isAdjudicationFlagEnabled(
  flag: Admin.CastVoteRecordAdjudicationFlag | ContestAdjudicationFlag,
  adminAdjudicationReasons: AdjudicationReason[]
): boolean {
  switch (flag) {
    case 'hasOvervote':
      return adminAdjudicationReasons.includes(AdjudicationReason.Overvote);
    case 'hasUndervote':
      return adminAdjudicationReasons.includes(AdjudicationReason.Undervote);
    case 'hasMarginalMark':
      return adminAdjudicationReasons.includes(AdjudicationReason.MarginalMark);
    case 'hasWriteIn':
      return true; // Write-ins always require adjudication
    case 'hasUnmarkedWriteIn':
      return adminAdjudicationReasons.includes(
        AdjudicationReason.UnmarkedWriteIn
      );
    case 'isBlank':
      return adminAdjudicationReasons.includes(AdjudicationReason.BlankBallot);
    default:
      throwIllegalValue(flag);
  }
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
  return Object.entries(adjudicationFlags)
    .filter(([, value]) => value)
    .some(([flag]) =>
      isAdjudicationFlagEnabled(
        flag as Admin.CastVoteRecordAdjudicationFlag,
        adminAdjudicationReasons
      )
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
  const writeIns = writeInRecords.filter((r) => r.contestId === contestId);
  const originalAdjudicationFlags = detectContestAdjudicationFlags({
    contest,
    votes,
    writeIns,
    markScores,
    markThresholds,
  });
  const adjudicationFlagsAfterAdjudication = adjudicatedVotes
    ? detectContestAdjudicationFlags({
        contest,
        votes: adjudicatedVotes,
        writeIns,
        markScores,
        markThresholds,
      })
    : [];

  const didAdjudicateMarginalMark =
    adjudicatedVotes !== undefined &&
    // If adjudicated votes differ from scanned votes for non-write-in
    // options, the user corrected a mark the scanner misread
    !deepEqual(
      votes.filter((v) => v.startsWith(Tabulation.GENERIC_WRITE_IN_ID)),
      adjudicatedVotes.filter((v) =>
        v.startsWith(Tabulation.GENERIC_WRITE_IN_ID)
      )
    );
  // TODO in the original code, this flag was added regardless of whether
  // marginal mark adjudication was enabled. Is that what we want?
  if (didAdjudicateMarginalMark) {
    adjudicationFlagsAfterAdjudication.push('hasMarginalMark');
  }

  const allAdjudicationsFlags = [
    ...originalAdjudicationFlags,
    ...adjudicationFlagsAfterAdjudication,
  ].filter((flag) => isAdjudicationFlagEnabled(flag, adminAdjudicationReasons));

  const needsAdjudication = allAdjudicationsFlags.length > 0;
  if (!needsAdjudication) {
    return undefined;
  }

  return {
    cvrId,
    contestId,
    isResolved: adjudicatedVotes !== undefined,
    ...Object.fromEntries(allAdjudicationsFlags.map((flag) => [flag, true])),
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
