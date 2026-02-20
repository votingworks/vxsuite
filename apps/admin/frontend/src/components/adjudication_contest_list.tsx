import React from 'react';
import styled from 'styled-components';
import {
  AnyContest,
  ContestId,
  Election,
  getContestDistrictName,
  Side,
} from '@votingworks/types';
import type {
  ContestAdjudicationData,
  ContestOptionAdjudicationData,
  CvrContestTag,
} from '@votingworks/admin-backend';
import { DesktopPalette, Icons } from '@votingworks/ui';
import { EntityList } from './entity_list';

const Column = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 0;
`;

const ClickableHeader = styled.button`
  all: unset;
  cursor: pointer;
  width: 100%;
`;

const ResolvedCaption = styled(EntityList.Caption)`
  color: ${DesktopPalette.Purple70};
`;

function getVotesAllowed(contest: AnyContest): number {
  return contest.type === 'yesno' ? 1 : contest.seats;
}

/**
 * Returns the effective vote for an option after all adjudications are applied.
 */
function getAdjudicatedVote(option: ContestOptionAdjudicationData): boolean {
  const { initialVote, voteAdjudication, writeInRecord } = option;

  if (writeInRecord && writeInRecord.status === 'adjudicated') {
    return writeInRecord.adjudicationType !== 'invalid';
  }

  if (voteAdjudication) {
    return voteAdjudication.isVote;
  }

  return initialVote;
}

type VoteStatus = 'overvote' | 'undervote' | 'normal';

function getVoteStatus(voteCount: number, votesAllowed: number): VoteStatus {
  if (voteCount > votesAllowed) return 'overvote';
  if (voteCount < votesAllowed) return 'undervote';
  return 'normal';
}

/**
 * Returns a status transition line if the adjudication changed the
 * overvote/undervote status of the contest.
 */
function getStatusTransitionLine(
  contestData: ContestAdjudicationData,
  contest: AnyContest,
  showUndervoteTransitions: boolean
): string | undefined {
  const votesAllowed = getVotesAllowed(contest);

  const originalVoteCount = contestData.options.filter(
    (o) => o.initialVote
  ).length;
  const adjudicatedVoteCount = contestData.options.filter((o) =>
    getAdjudicatedVote(o)
  ).length;

  const originalStatus = getVoteStatus(originalVoteCount, votesAllowed);
  const adjudicatedStatus = getVoteStatus(adjudicatedVoteCount, votesAllowed);

  if (originalStatus === adjudicatedStatus) return undefined;

  // Overvote resolved
  if (originalStatus === 'overvote' && adjudicatedStatus !== 'overvote') {
    if (adjudicatedStatus === 'undervote' && showUndervoteTransitions) {
      return 'Overvote resolved; now an Undervote';
    }
    return 'Overvote resolved';
  }

  // New overvote
  if (adjudicatedStatus === 'overvote') {
    return 'Now an Overvote';
  }

  // Undervote transitions only if enabled
  if (showUndervoteTransitions) {
    if (originalStatus === 'undervote' && adjudicatedStatus !== 'undervote') {
      return 'Undervote resolved';
    }
    if (adjudicatedStatus === 'undervote') {
      return 'Now an Undervote';
    }
  }

  return undefined;
}

/**
 * Returns a human-readable description of what was adjudicated for a single
 * contest option.
 */
function getOptionResolutionDescription(
  option: ContestOptionAdjudicationData,
  contest: AnyContest,
  writeInCandidateNames: Map<string, string>
): string | undefined {
  const {
    definition,
    initialVote,
    hasMarginalMark,
    voteAdjudication,
    writeInRecord,
  } = option;

  // Write-in adjudication takes priority
  if (writeInRecord && writeInRecord.status === 'adjudicated') {
    switch (writeInRecord.adjudicationType) {
      case 'official-candidate': {
        const candidateName =
          contest.type === 'candidate'
            ? contest.candidates.find((c) => c.id === writeInRecord.candidateId)
                ?.name ?? writeInRecord.candidateId
            : writeInRecord.candidateId;
        return `Write-in for “${candidateName}”`;
      }
      case 'write-in-candidate': {
        const candidateName =
          writeInCandidateNames.get(writeInRecord.candidateId) ??
          writeInRecord.candidateId;
        return `Write-in for “${candidateName}”`;
      }
      case 'invalid':
        return `Write-in is Invalid`;
      default:
        return undefined;
    }
  }

  // Marginal mark - show caption whether explicitly adjudicated or dismissed
  if (hasMarginalMark) {
    const isVote = voteAdjudication ? voteAdjudication.isVote : initialVote;
    const voteText = isVote ? 'is Valid' : 'is Invalid';
    return `Marginal mark for “${definition.name}” ${voteText}`;
  }

  // Standard vote change
  if (voteAdjudication) {
    const preface = voteAdjudication.isVote ? 'Undetected mark' : 'Mark';
    const voteText = voteAdjudication.isVote ? 'is Valid' : 'is Invalid';
    return `${preface} for “${definition.name}” ${voteText}`;
  }

  return undefined;
}

/**
 * Returns bullet-point descriptions for all adjudicated options in a resolved
 * contest.
 */
function getResolutionBullets(
  contestData: ContestAdjudicationData,
  contest: AnyContest,
  writeInCandidateNames: Map<string, string>
): string[] {
  return contestData.options
    .map((option) =>
      getOptionResolutionDescription(option, contest, writeInCandidateNames)
    )
    .filter((desc): desc is string => desc !== undefined);
}

export interface AdjudicationContestListProps {
  frontContests: AnyContest[];
  backContests: AnyContest[];
  election: Election;
  tagsByContestId: Map<ContestId, CvrContestTag | null>;
  adjudicationContests: ContestAdjudicationData[];
  writeInCandidateNames: Map<string, string>;
  showUndervoteTransitions: boolean;
  onSelect: (contestId: ContestId) => void;
  onHover?: (contestId: ContestId | null) => void;
  onSelectSide: (side: Side) => void;
}

function ContestSublist({
  contests,
  election,
  tagsByContestId,
  adjudicationContestsByContestId,
  writeInCandidateNames,
  showUndervoteTransitions,
  onSelect,
  onHover,
  title,
  firstUnresolvedContestId,
  onHeaderClick,
}: {
  contests: AnyContest[];
  election: Election;
  tagsByContestId: Map<ContestId, CvrContestTag | null>;
  adjudicationContestsByContestId: Map<ContestId, ContestAdjudicationData>;
  writeInCandidateNames: Map<string, string>;
  showUndervoteTransitions: boolean;
  onSelect: (contestId: ContestId) => void;
  onHover?: (contestId: ContestId | null) => void;
  title: string;
  firstUnresolvedContestId?: ContestId;
  onHeaderClick?: () => void;
}): React.ReactNode {
  return (
    <React.Fragment>
      {onHeaderClick ? (
        <ClickableHeader type="button" onClick={onHeaderClick}>
          <EntityList.Header>{title}</EntityList.Header>
        </ClickableHeader>
      ) : (
        <EntityList.Header>{title}</EntityList.Header>
      )}
      <EntityList.Items>
        {contests.map((contest) => {
          const tag = tagsByContestId.get(contest.id);
          const isPending = tag && !tag.isResolved;
          const isResolved = tag && tag.isResolved;
          const isFirstUnresolved = contest.id === firstUnresolvedContestId;

          const contestData = adjudicationContestsByContestId.get(contest.id);
          const bullets =
            isResolved && contestData
              ? getResolutionBullets(
                  contestData,
                  contest,
                  writeInCandidateNames
                )
              : [];
          const statusLine =
            isResolved && contestData
              ? getStatusTransitionLine(
                  contestData,
                  contest,
                  showUndervoteTransitions
                )
              : undefined;

          return (
            <EntityList.Item
              id={contest.id}
              key={contest.id}
              selected={false}
              onSelect={onSelect}
              onHover={onHover}
              autoScrollIntoView={isFirstUnresolved}
              hasWarning={isPending || false}
            >
              <Column>
                <EntityList.Caption>
                  {getContestDistrictName(election, contest)}
                </EntityList.Caption>
                <EntityList.Label
                  weight="semiBold"
                  style={{ marginBottom: '0.25rem' }}
                >
                  {contest.title}
                </EntityList.Label>
                {statusLine && (
                  <ResolvedCaption weight="semiBold">
                    {statusLine}
                  </ResolvedCaption>
                )}
                {isResolved &&
                  bullets.map((bullet) => (
                    <ResolvedCaption key={bullet} weight="semiBold">
                      &bull; {bullet}
                    </ResolvedCaption>
                  ))}
              </Column>
              {isPending && <Icons.Warning color="warning" />}
            </EntityList.Item>
          );
        })}
      </EntityList.Items>
    </React.Fragment>
  );
}

export function AdjudicationContestList(
  props: AdjudicationContestListProps
): React.ReactNode {
  const {
    frontContests,
    backContests,
    election,
    tagsByContestId,
    adjudicationContests,
    writeInCandidateNames,
    showUndervoteTransitions,
    onSelect,
    onHover,
    onSelectSide,
  } = props;

  const allContests = [...frontContests, ...backContests];
  const firstUnresolvedContestId = allContests.find((c) => {
    const tag = tagsByContestId.get(c.id);
    return tag && !tag.isResolved;
  })?.id;

  const adjudicationContestsByContestId = new Map(
    adjudicationContests.map((c) => [c.contestId, c])
  );

  return (
    <EntityList.Box>
      {frontContests.length > 0 && (
        <ContestSublist
          contests={frontContests}
          election={election}
          tagsByContestId={tagsByContestId}
          adjudicationContestsByContestId={adjudicationContestsByContestId}
          writeInCandidateNames={writeInCandidateNames}
          showUndervoteTransitions={showUndervoteTransitions}
          onSelect={onSelect}
          onHover={onHover}
          title="Front"
          firstUnresolvedContestId={firstUnresolvedContestId}
          onHeaderClick={() => onSelectSide('front')}
        />
      )}
      {backContests.length > 0 && (
        <ContestSublist
          contests={backContests}
          election={election}
          tagsByContestId={tagsByContestId}
          adjudicationContestsByContestId={adjudicationContestsByContestId}
          writeInCandidateNames={writeInCandidateNames}
          showUndervoteTransitions={showUndervoteTransitions}
          onSelect={onSelect}
          onHover={onHover}
          title="Back"
          firstUnresolvedContestId={firstUnresolvedContestId}
          onHeaderClick={() => onSelectSide('back')}
        />
      )}
    </EntityList.Box>
  );
}
