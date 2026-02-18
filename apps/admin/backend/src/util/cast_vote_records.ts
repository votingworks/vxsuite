import {
  AnyContest,
  ContestId,
  ElectionDefinition,
  Id,
  Tabulation,
} from '@votingworks/types';
import { CachedElectionLookups } from '@votingworks/utils';
import { CastVoteRecordAdjudicationFlags, CvrContestTag } from '../types';

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
  electionDefinition: ElectionDefinition
): CastVoteRecordAdjudicationFlags {
  let isBlank = true;
  let hasUndervote = false;
  let hasOvervote = false;
  let hasWriteIn = false;

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

  return {
    isBlank,
    hasUndervote,
    hasOvervote,
    hasWriteIn,
  };
}

/**
 * An ease of use helper class to manage a list of
 * CvrContestTags without duplicates.
 */
export class CvrContestTagList {
  constructor(private readonly cvrId: Id) {}
  private readonly byContestId = new Map<ContestId, CvrContestTag>();

  getOrCreateTag(contestId: ContestId): CvrContestTag {
    const existingContestTag = this.byContestId.get(contestId);
    if (existingContestTag) {
      return existingContestTag;
    }
    const newContestTag: CvrContestTag = {
      cvrId: this.cvrId,
      contestId,
      isResolved: false,
      isUndetected: false,
    };
    this.byContestId.set(contestId, newContestTag);
    return newContestTag;
  }

  toArray(): CvrContestTag[] {
    return Array.from(this.byContestId.values());
  }
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
