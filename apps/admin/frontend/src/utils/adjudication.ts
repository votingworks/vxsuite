import type {
  AdjudicatedContestOption,
  AdjudicatedCvrContest,
  ContestAdjudicationData,
  ContestOptionAdjudicationData,
  CvrContestTag,
} from '@votingworks/admin-backend';
import { find, throwIllegalValue } from '@votingworks/basics';
import {
  AnyContest,
  BallotPageContestOptionLayout,
  ContestId,
  ContestOptionId,
  Election,
  isOpenPrimary,
  Rect,
  Vote,
  VotesDict,
} from '@votingworks/types';

export function normalizeWriteInName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/, ' ');
}

export function getOptionCoordinates(
  optionsLayout: readonly BallotPageContestOptionLayout[],
  optionId: ContestOptionId
): Rect {
  const option = optionsLayout.find((opt) => opt.definition?.id === optionId);
  /* istanbul ignore next */
  if (!option) {
    throw new Error(
      'unable to find option in layout when determining option ballot coordinates'
    );
  }
  return option.bounds;
}

export function isContestTagOnlyUndervote(tag: CvrContestTag): boolean {
  return (
    (tag.hasUndervote &&
      !tag.hasMarginalMark &&
      !tag.hasWriteIn &&
      !tag.hasUnmarkedWriteIn &&
      !tag.hasOvervote) ??
    false
  );
}

export function isContestResolved(
  contest: ContestAdjudicationData,
  adjudicatedContests: ReadonlyMap<ContestId, AdjudicatedCvrContest>
): boolean {
  if (!contest.tag) return true;
  return adjudicatedContests.has(contest.contestId);
}

export function getCurrentVote(
  option: ContestOptionAdjudicationData,
  adjudicatedOption?: AdjudicatedContestOption
): boolean {
  return adjudicatedOption?.hasVote ?? option.scannedVote;
}

export function isContestCrossoverVoted(
  ballotHasCrossoverVote: boolean,
  contestItem: {
    contest: AnyContest;
    adjudicationData: ContestAdjudicationData;
  },
  adjudicatedContest?: AdjudicatedCvrContest
): boolean {
  if (!ballotHasCrossoverVote) return false;
  const { contest, adjudicationData } = contestItem;
  if (!(contest.type === 'candidate' && contest.partyId)) return false;
  const hasVote = adjudicationData.options.some((option) =>
    getCurrentVote(
      option,
      adjudicatedContest?.adjudicatedContestOptionById[option.definition.id]
    )
  );
  return hasVote;
}

export function adjudicatedVotes(
  contests: ReadonlyArray<{
    contest: AnyContest;
    adjudicationData: ContestAdjudicationData;
  }>,
  adjudicatedContests: ReadonlyMap<ContestId, AdjudicatedCvrContest>
): VotesDict {
  return Object.fromEntries(
    contests.map(({ contest, adjudicationData }): [string, Vote] => {
      const adjudicatedContest = adjudicatedContests.get(contest.id);
      switch (contest.type) {
        case 'candidate':
          return [
            contest.id,
            adjudicationData.options.flatMap((option) =>
              getCurrentVote(
                option,
                adjudicatedContest?.adjudicatedContestOptionById[
                  option.definition.id
                ]
              )
                ? [option.definition]
                : []
            ),
          ];
        case 'yesno':
          return [
            contest.id,
            adjudicationData.options.flatMap((option) =>
              getCurrentVote(
                option,
                adjudicatedContest?.adjudicatedContestOptionById[
                  option.definition.id
                ]
              )
                ? [option.definition.id]
                : []
            ),
          ];
        default:
          /* istanbul ignore next */
          return throwIllegalValue(contest);
      }
    })
  );
}

export function contestPartyLabel(
  election: Election,
  contest: AnyContest
): string | undefined {
  return isOpenPrimary(election) &&
    contest.type === 'candidate' &&
    contest.partyId
    ? find(election.parties, (p) => p.id === contest.partyId).fullName
    : undefined;
}
