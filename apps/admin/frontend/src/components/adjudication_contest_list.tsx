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
import { Button, DesktopPalette, Icons } from '@votingworks/ui';
import { EntityList } from './entity_list';

const Column = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 0;
`;

const ViewSideButton = styled(Button)`
  font-size: 0.875rem;
  padding: 0.2rem 0.5rem;
`;

const ResolvedCaption = styled(EntityList.Caption)`
  color: ${DesktopPalette.Purple70};
`;

const StraightPartyCaption = styled(EntityList.Caption)`
  color: ${(p) => p.theme.colors.onBackground};
`;

function getVotesAllowed(contest: AnyContest): number {
  return contest.type === 'yesno' || contest.type === 'straight-party'
    ? 1
    : contest.seats;
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
    return `Marginal Mark for “${definition.name}” ${voteText}`;
  }

  // Standard vote change
  if (voteAdjudication) {
    const preface = voteAdjudication.isVote ? 'Undetected Mark' : 'Mark';
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
  selectedSide: Side;
  onSelect: (contestId: ContestId) => void;
  onHover?: (contestId: ContestId | null) => void;
  onSelectSide: (side: Side) => void;
}

interface StraightPartyStatus {
  text: string;
  isChanged: boolean;
}

function getStraightPartyStatus(
  contestData: ContestAdjudicationData
): StraightPartyStatus {
  const originalVoteCount = contestData.options.filter(
    (o) => o.initialVote
  ).length;
  const votedOptions = contestData.options.filter((o) => getAdjudicatedVote(o));
  const isChanged = votedOptions.length !== originalVoteCount;

  if (votedOptions.length === 1) {
    return {
      text: `Straight party vote applied: ${votedOptions[0].definition.name}`,
      isChanged,
    };
  }
  return { text: 'Straight party vote not applied', isChanged };
}

function ContestSublist({
  contests,
  election,
  tagsByContestId,
  adjudicationContestsByContestId,
  writeInCandidateNames,
  showUndervoteTransitions,
  straightPartyStatus,
  onSelect,
  onHover,
  title,
  firstUnresolvedContestId,
  isActive,
  onHeaderClick,
}: {
  contests: AnyContest[];
  election: Election;
  tagsByContestId: Map<ContestId, CvrContestTag | null>;
  adjudicationContestsByContestId: Map<ContestId, ContestAdjudicationData>;
  writeInCandidateNames: Map<string, string>;
  showUndervoteTransitions: boolean;
  straightPartyStatus?: StraightPartyStatus;
  onSelect: (contestId: ContestId) => void;
  onHover?: (contestId: ContestId | null) => void;
  title: string;
  firstUnresolvedContestId?: ContestId;
  isActive?: boolean;
  onHeaderClick?: () => void;
}): React.ReactNode {
  return (
    <React.Fragment>
      <EntityList.Header
        as="div"
        onClick={!isActive ? onHeaderClick : undefined}
        style={{
          cursor: !isActive && onHeaderClick ? 'pointer' : undefined,
          display: 'flex',
          justifyContent: 'space-between',
          gap: '0.5rem',
          alignItems: 'center',
        }}
      >
        {title}
        {onHeaderClick && (
          <ViewSideButton
            fill="tinted"
            onPress={onHeaderClick}
            disabled={isActive}
          >
            View
          </ViewSideButton>
        )}
      </EntityList.Header>
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
                {contest.type === 'straight-party' &&
                  straightPartyStatus &&
                  (straightPartyStatus.isChanged ? (
                    <ResolvedCaption weight="semiBold">
                      {straightPartyStatus.text}
                    </ResolvedCaption>
                  ) : (
                    <StraightPartyCaption>
                      {straightPartyStatus.text}
                    </StraightPartyCaption>
                  ))}
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
    selectedSide,
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

  const spContest = allContests.find((c) => c.type === 'straight-party');
  const spContestData = spContest
    ? adjudicationContestsByContestId.get(spContest.id)
    : undefined;
  const straightPartyStatus = spContestData
    ? getStraightPartyStatus(spContestData)
    : undefined;

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
          straightPartyStatus={straightPartyStatus}
          onSelect={onSelect}
          onHover={onHover}
          title="Front"
          firstUnresolvedContestId={firstUnresolvedContestId}
          isActive={selectedSide === 'front'}
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
          straightPartyStatus={straightPartyStatus}
          onSelect={onSelect}
          onHover={onHover}
          title="Back"
          firstUnresolvedContestId={firstUnresolvedContestId}
          isActive={selectedSide === 'back'}
          onHeaderClick={() => onSelectSide('back')}
        />
      )}
    </EntityList.Box>
  );
}
