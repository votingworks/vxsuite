import React from 'react';
import styled from 'styled-components';
import {
  AnyContest,
  CandidateContest,
  ContestId,
  Election,
  getContestDistrictName,
  Id,
  Side,
} from '@votingworks/types';
import type {
  ContestAdjudicationData,
  ContestOptionAdjudicationData,
  CvrTag,
} from '@votingworks/admin-backend';
import { assertDefined } from '@votingworks/basics';
import {
  Button,
  Callout,
  Caption,
  DesktopPalette,
  Icons,
  P,
} from '@votingworks/ui';
import { EntityList } from './entity_list';

const Column = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
`;

const ViewSideButton = styled(Button)`
  font-size: 0.875rem;
  padding: 0.2rem 0.5rem;
`;

const ViewSideCalloutButton = styled(ViewSideButton)`
  &:hover {
    background-color: ${DesktopPalette.Purple40};
  }
`;

const BlankBallotCalloutContainer = styled.div`
  padding: 0.5rem;
  border-bottom: var(--entity-list-border);
`;

const CalloutContent = styled.div`
  align-items: baseline;
  display: flex;
  flex-grow: 1;
  gap: 0.5rem;
`;

const CalloutBody = styled.div`
  align-items: center;
  display: flex;
  flex-grow: 1;
  gap: 0.5rem;
`;

const CalloutTitleContainer = styled.div`
  flex-grow: 1;
`;

const CalloutTitle = styled(P)`
  font-size: 1rem;
  line-height: 1;
  margin-bottom: 0;
`;

const ResolvedCaption = styled(EntityList.Caption)`
  color: ${DesktopPalette.Purple70};
`;

const StatusLine = styled.span`
  align-items: center;
  display: inline-flex;
  gap: 0.25rem;
`;

function getVotesAllowed(contest: AnyContest): number {
  return contest.type === 'yesno' ? 1 : contest.seats;
}

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

function getStatusLine(
  contestData: ContestAdjudicationData,
  contest: AnyContest,
  showUndervoteTransitions: boolean
): React.ReactNode {
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
      return (
        <StatusLine>
          <Icons.Warning color="warning" />
          Overvote Resolved; Undervote Created
        </StatusLine>
      );
    }
    return 'Overvote Resolved';
  }

  // New overvote
  if (adjudicatedStatus === 'overvote') {
    return (
      <StatusLine>
        <Icons.Warning color="warning" />
        Overvote Created
      </StatusLine>
    );
  }

  // Undervote transitions only if enabled
  if (showUndervoteTransitions) {
    if (originalStatus === 'undervote' && adjudicatedStatus !== 'undervote') {
      return 'Undervote Resolved';
    }
    if (adjudicatedStatus === 'undervote') {
      return (
        <StatusLine>
          <Icons.Warning color="warning" />
          Undervote Created
        </StatusLine>
      );
    }
  }

  return undefined;
}

function getOptionResolutionLine(
  option: ContestOptionAdjudicationData,
  contest: AnyContest,
  writeInCandidateNamesById: Map<Id, string>
): string | undefined {
  const {
    definition,
    initialVote,
    hasMarginalMark,
    voteAdjudication,
    writeInRecord,
  } = option;

  if (writeInRecord && writeInRecord.status === 'adjudicated') {
    const writeInPrefix =
      writeInRecord.isUnmarked || writeInRecord.isUndetected || hasMarginalMark
        ? 'Ambiguous Write-In'
        : 'Write-In';
    switch (writeInRecord.adjudicationType) {
      case 'official-candidate': {
        const candidateName = assertDefined(
          (contest as CandidateContest).candidates.find(
            (c) => c.id === writeInRecord.candidateId
          )
        ).name;
        return `${writeInPrefix} adjudicated for “${candidateName}”`;
      }
      case 'write-in-candidate': {
        const candidateName = assertDefined(
          writeInCandidateNamesById.get(writeInRecord.candidateId)
        );
        return `${writeInPrefix} adjudicated for “${candidateName}”`;
      }
      case 'invalid':
        return `${writeInPrefix} adjudicated as Invalid`;
      default:
        return undefined;
    }
  }

  if (hasMarginalMark) {
    const isVote = voteAdjudication ? voteAdjudication.isVote : initialVote;
    const voteText = isVote ? 'adjudicated as Valid' : 'adjudicated as Invalid';
    return `Marginal Mark for “${definition.name}” ${voteText}`;
  }

  if (voteAdjudication) {
    const preface = voteAdjudication.isVote ? 'Undetected Mark' : 'Mark';
    const voteText = voteAdjudication.isVote
      ? 'adjudicated as Valid'
      : 'adjudicated as Invalid';
    return `${preface} for “${definition.name}” ${voteText}`;
  }

  return undefined;
}

function getResolutionBullets(
  contestData: ContestAdjudicationData,
  contest: AnyContest,
  writeInCandidateNamesById: Map<Id, string>
): string[] {
  return contestData.options
    .map((option) =>
      getOptionResolutionLine(option, contest, writeInCandidateNamesById)
    )
    .filter((desc): desc is string => desc !== undefined);
}

export interface ContestListItem {
  contest: AnyContest;
  adjudicationData: ContestAdjudicationData;
}

function BallotSideContestList({
  contests,
  election,
  firstUnresolvedContestId,
  isVisibleSide,
  isBlankBallot,
  onHeaderClick,
  onHover,
  onSelect,
  showUndervoteTransitions,
  title,
  writeInCandidateNamesById,
}: {
  contests: ContestListItem[];
  election: Election;
  firstUnresolvedContestId?: ContestId;
  isVisibleSide: boolean;
  isBlankBallot?: boolean;
  onHeaderClick: () => void;
  onHover: (contestId: ContestId | null) => void;
  onSelect: (contestId: ContestId) => void;
  showUndervoteTransitions: boolean;
  title: string;
  writeInCandidateNamesById: Map<Id, string>;
}): React.ReactNode {
  return (
    <React.Fragment>
      <EntityList.Header
        onClick={!isVisibleSide ? onHeaderClick : undefined}
        style={{
          cursor: !isVisibleSide ? 'pointer' : undefined,
          display: 'flex',
          justifyContent: 'space-between',
          gap: '0.5rem',
          alignItems: 'center',
        }}
      >
        {title}
        <ViewSideButton
          fill="tinted"
          onPress={onHeaderClick}
          disabled={isVisibleSide}
        >
          View
        </ViewSideButton>
      </EntityList.Header>
      <EntityList.Items>
        {contests.map(({ contest, adjudicationData }) => {
          const { tag } = adjudicationData;
          const isPending = tag && !tag.isResolved;
          const isResolved = tag && tag.isResolved;
          const isFirstUnresolved = contest.id === firstUnresolvedContestId;
          const isOnlyUndervote =
            tag &&
            tag.hasUndervote &&
            !tag.hasMarginalMark &&
            !tag.hasWriteIn &&
            !tag.hasUnmarkedWriteIn &&
            !tag.hasOvervote;

          const bullets = isResolved
            ? getResolutionBullets(
                adjudicationData,
                contest,
                writeInCandidateNamesById
              )
            : [];
          const statusLine = isResolved
            ? getStatusLine(adjudicationData, contest, showUndervoteTransitions)
            : undefined;

          return (
            <EntityList.Item
              id={contest.id}
              key={contest.id}
              onSelect={onSelect}
              onHover={onHover}
              autoScrollIntoView={isFirstUnresolved}
              hasWarning={
                (isPending && !(isBlankBallot && isOnlyUndervote)) || false
              }
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
              {isPending && !(isBlankBallot && isOnlyUndervote) && (
                <Icons.Warning color="warning" />
              )}
            </EntityList.Item>
          );
        })}
      </EntityList.Items>
    </React.Fragment>
  );
}

export interface AdjudicationContestListProps {
  backContests: ContestListItem[];
  cvrTag: CvrTag | null;
  election: Election;
  frontContests: ContestListItem[];
  onHover: (contestId: ContestId | null) => void;
  onSelect: (contestId: ContestId) => void;
  onSelectSide: (side: Side) => void;
  selectedSide: Side;
  showUndervoteTransitions: boolean;
  writeInCandidateNamesById: Map<Id, string>;
}

export function AdjudicationContestList({
  backContests,
  cvrTag,
  election,
  frontContests,
  onHover,
  onSelect,
  onSelectSide,
  selectedSide,
  showUndervoteTransitions,
  writeInCandidateNamesById,
}: AdjudicationContestListProps): React.ReactNode {
  const allContests = [...frontContests, ...backContests];
  const firstUnresolvedContestId = cvrTag?.isBlankBallot
    ? undefined
    : allContests.find(
        (item) =>
          item.adjudicationData.tag && !item.adjudicationData.tag.isResolved
      )?.contest.id;

  const blankBallotHasAnyAdjudicatedVote =
    cvrTag?.isBlankBallot &&
    allContests.some((item) =>
      item.adjudicationData.options.some((o) => getAdjudicatedVote(o))
    );

  const blankBallotCalloutTitle = (() => {
    if (!cvrTag?.isBlankBallot) return undefined;
    if (blankBallotHasAnyAdjudicatedVote) {
      return 'Blank Ballot Resolved';
    }
    return cvrTag.isResolved
      ? 'Blank Ballot Confirmed'
      : 'Blank Ballot Detected';
  })();

  return (
    <EntityList.Box>
      {cvrTag?.isBlankBallot && (
        <BlankBallotCalloutContainer>
          <Callout
            color={
              blankBallotHasAnyAdjudicatedVote
                ? 'neutral'
                : !cvrTag.isResolved
                ? 'warning'
                : 'primary'
            }
          >
            <CalloutContent>
              <P aria-hidden style={{ lineHeight: 1, marginBottom: 0 }}>
                {cvrTag.isResolved || blankBallotHasAnyAdjudicatedVote ? (
                  <Icons.Done
                    color={
                      blankBallotHasAnyAdjudicatedVote ? 'neutral' : 'primary'
                    }
                  />
                ) : (
                  <Icons.Warning color="warning" />
                )}
              </P>
              <CalloutBody>
                <CalloutTitleContainer>
                  <CalloutTitle weight="bold">
                    {blankBallotCalloutTitle}
                  </CalloutTitle>
                  {blankBallotHasAnyAdjudicatedVote && (
                    <Caption weight="regular" style={{ lineHeight: 1 }}>
                      At least one contest now has a valid vote
                    </Caption>
                  )}
                </CalloutTitleContainer>
                {!blankBallotHasAnyAdjudicatedVote && (
                  <ViewSideCalloutButton
                    fill="filled"
                    onPress={() => onSelectSide('back')}
                    color={
                      cvrTag.isResolved ? 'inversePrimary' : 'inverseNeutral'
                    }
                  >
                    View Back
                  </ViewSideCalloutButton>
                )}
              </CalloutBody>
            </CalloutContent>
          </Callout>
        </BlankBallotCalloutContainer>
      )}
      {frontContests.length > 0 && (
        <BallotSideContestList
          contests={frontContests}
          election={election}
          firstUnresolvedContestId={firstUnresolvedContestId}
          isBlankBallot={cvrTag?.isBlankBallot}
          isVisibleSide={selectedSide === 'front'}
          onHeaderClick={() => onSelectSide('front')}
          onHover={onHover}
          onSelect={onSelect}
          showUndervoteTransitions={showUndervoteTransitions}
          title="Front"
          writeInCandidateNamesById={writeInCandidateNamesById}
        />
      )}
      {backContests.length > 0 && (
        <BallotSideContestList
          contests={backContests}
          election={election}
          firstUnresolvedContestId={firstUnresolvedContestId}
          isBlankBallot={cvrTag?.isBlankBallot}
          isVisibleSide={selectedSide === 'back'}
          onHeaderClick={() => onSelectSide('back')}
          onHover={onHover}
          onSelect={onSelect}
          showUndervoteTransitions={showUndervoteTransitions}
          title="Back"
          writeInCandidateNamesById={writeInCandidateNamesById}
        />
      )}
    </EntityList.Box>
  );
}
