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
  Rect,
  Side,
  Vote,
  VotesDict,
} from '@votingworks/types';
import { hasCrossoverVote } from '@votingworks/utils';

export type AdjudicatedContests = Map<ContestId, AdjudicatedCvrContest>;

export interface ContestListItem {
  side: Side;
  contest: AnyContest;
  adjudicationData: ContestAdjudicationData;
  isResolved: boolean;
}

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
  contests: ContestListItem[],
  adjudicatedContests: AdjudicatedContests
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

export interface ContestCrossoverVoteStatus {
  hasScannedCrossoverVote: boolean;
  hasCrossoverVoteAfterAdjudication: boolean;
  isUnresolved: boolean;
}
export type CrossoverVoteStatusByContest = Record<
  ContestId,
  ContestCrossoverVoteStatus
>;
export interface BallotCrossoverVoteStatus {
  ballotHasScannedCrossoverVote: boolean;
  ballotHasCrossoverVoteAfterAdjudication: boolean;
  statusByContest: Record<ContestId, ContestCrossoverVoteStatus>;
  isBallotResolved: boolean;
}

export function deriveCrossoverVoteStatus(
  election: Election,
  contestItems: ContestListItem[],
  adjudicatedContests: AdjudicatedContests,
  ballotHasScannedCrossoverVote: boolean,
  isBallotResolved: boolean
): BallotCrossoverVoteStatus {
  const ballotHasCrossoverVoteAfterAdjudication = hasCrossoverVote(
    election,
    adjudicatedVotes(contestItems, adjudicatedContests)
  );
  return {
    ballotHasScannedCrossoverVote,
    ballotHasCrossoverVoteAfterAdjudication,
    isBallotResolved,
    statusByContest: Object.fromEntries(
      contestItems.map((contestItem) => {
        const hasScannedCrossoverVote = isContestCrossoverVoted(
          ballotHasScannedCrossoverVote,
          contestItem
        );
        const hasCrossoverVoteAfterAdjudication = isContestCrossoverVoted(
          ballotHasCrossoverVoteAfterAdjudication,
          contestItem,
          adjudicatedContests.get(contestItem.contest.id)
        );
        return [
          contestItem.contest.id,
          {
            hasScannedCrossoverVote,
            hasCrossoverVoteAfterAdjudication,
            isUnresolved:
              hasScannedCrossoverVote &&
              hasCrossoverVoteAfterAdjudication &&
              !isBallotResolved,
          },
        ];
      })
    ),
  };
}

export function contestPartyLabel(
  election: Election,
  contest: AnyContest
): string | undefined {
  return election.type === 'open-primary' &&
    contest.type === 'candidate' &&
    contest.partyId
    ? find(election.parties, (p) => p.id === contest.partyId).fullName
    : undefined;
}
