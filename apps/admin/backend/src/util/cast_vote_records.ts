import {
  AnyContest,
  ContestId,
  ElectionDefinition,
  Id,
  Tabulation,
} from '@votingworks/types';
import { CachedElectionLookups } from '@votingworks/utils';
import { CastVoteRecordAdjudicationFlags, CvrContestTag } from '../types';

function getNumberVotesAllowed(contest: AnyContest): number {
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
    };
    this.byContestId.set(contestId, newContestTag);
    return newContestTag;
  }

  toArray(): CvrContestTag[] {
    return Array.from(this.byContestId.values());
  }
}
