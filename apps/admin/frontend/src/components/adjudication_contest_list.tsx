import React from 'react';
import styled from 'styled-components';
import {
  AnyContest,
  CandidateContest,
  ContestId,
  Election,
  getContestDistrictName,
  Side,
} from '@votingworks/types';
import type {
  AdjudicatedContestOption,
  AdjudicatedCvrContest,
  ContestAdjudicationData,
  ContestOptionAdjudicationData,
  CvrTag,
} from '@votingworks/admin-backend';
import { find } from '@votingworks/basics';
import {
  Button,
  Callout,
  Caption,
  Font,
  FontProps,
  Icons,
  P,
} from '@votingworks/ui';
import pluralize from 'pluralize';
import { EntityList } from './entity_list';
import {
  isContestResolved,
  isContestTagOnlyUndervote,
} from '../utils/adjudication';

const Column = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
`;

const ViewSideButton = styled(Button)`
  font-size: 0.875rem;
  padding: 0.2rem 0.5rem;
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

const StatusCaption = styled(EntityList.Caption)`
  align-items: center;
  display: flex;
  gap: 0.25rem;
`;

function StatusLine({
  icon,
  children,
  ...fontProps
}: FontProps &
  React.PropsWithChildren<{
    icon: JSX.Element;
  }>) {
  return (
    <StatusCaption {...fontProps}>
      {icon} {children}
    </StatusCaption>
  );
}

const StatusLineNeedsAdjudication = styled(StatusLine).attrs({
  icon: <Icons.PenToSquare color="warning" />,
  weight: 'semiBold',
})`
  color: ${(p) => p.theme.colors.onBackground};
`;

const StatusLineWarning = styled(StatusLine).attrs({
  icon: <Icons.Warning color="warning" />,
  weight: 'semiBold',
})`
  color: ${(p) => p.theme.colors.primary};
`;

const StatusLineConfirmed = styled(StatusLine).attrs({
  icon: <Icons.Done />,
  weight: 'semiBold',
})`
  color: ${(p) => p.theme.colors.primary};
`;

const StatusLineAdjudicated = styled(StatusLine).attrs({
  icon: <Icons.PenToSquare />,
})`
  color: ${(p) => p.theme.colors.primary};
`;

function getVotesAllowed(contest: AnyContest): number {
  return contest.type === 'yesno' ? 1 : contest.seats;
}

function getCurrentVote(
  option: ContestOptionAdjudicationData,
  adjudicatedOption?: AdjudicatedContestOption
): boolean {
  return adjudicatedOption?.hasVote ?? option.scannedVote;
}

type VoteStatus = 'overvote' | 'undervote' | 'normal';

function getVoteStatus(voteCount: number, votesAllowed: number): VoteStatus {
  if (voteCount > votesAllowed) return 'overvote';
  if (voteCount < votesAllowed) return 'undervote';
  return 'normal';
}

export interface ContestListItem {
  contest: AnyContest;
  adjudicationData: ContestAdjudicationData;
}

function getAdjudicatedContestStatusLine(
  item: ContestListItem,
  showUndervoteStatus: boolean,
  adjudicatedContest: AdjudicatedCvrContest
): React.ReactNode {
  const votesAllowed = getVotesAllowed(item.contest);

  const originalVoteCount = item.adjudicationData.options.filter(
    (o) => o.scannedVote
  ).length;
  const adjudicatedVoteCount = item.adjudicationData.options.filter((o) =>
    getCurrentVote(
      o,
      adjudicatedContest.adjudicatedContestOptionById[o.definition.id]
    )
  ).length;

  const originalStatus = getVoteStatus(originalVoteCount, votesAllowed);
  const adjudicatedStatus = getVoteStatus(adjudicatedVoteCount, votesAllowed);

  if (originalStatus === adjudicatedStatus) {
    if (originalStatus === 'overvote') {
      return <StatusLineConfirmed>Overvote Confirmed</StatusLineConfirmed>;
    }
    if (originalStatus === 'undervote' && showUndervoteStatus) {
      return <StatusLineConfirmed>Undervote Confirmed</StatusLineConfirmed>;
    }
    return null;
  }

  // Overvote resolved
  if (originalStatus === 'overvote' && adjudicatedStatus !== 'overvote') {
    if (adjudicatedStatus === 'undervote' && showUndervoteStatus) {
      return (
        <StatusLineWarning>
          Overvote Resolved; Undervote Created
        </StatusLineWarning>
      );
    }
    return <StatusLineConfirmed>Overvote Resolved</StatusLineConfirmed>;
  }

  // New overvote
  if (adjudicatedStatus === 'overvote') {
    return <StatusLineWarning>Overvote Created</StatusLineWarning>;
  }

  // Undervote transitions only if enabled
  if (showUndervoteStatus) {
    if (originalStatus === 'undervote' && adjudicatedStatus !== 'undervote') {
      return <StatusLineConfirmed>Undervote Resolved</StatusLineConfirmed>;
    }
    return <StatusLineWarning>Undervote Created</StatusLineWarning>;
  }
}

function getAdjudicatedOptionStatusLine(
  option: ContestOptionAdjudicationData,
  contest: AnyContest,
  adjudicatedOption?: AdjudicatedContestOption
): React.ReactNode {
  const { definition, scannedVote, hasMarginalMark, writeInRecord } = option;

  if (
    adjudicatedOption?.type === 'write-in-option' &&
    (adjudicatedOption.hasVote || writeInRecord)
  ) {
    const candidateName: string | undefined = (() => {
      if (!adjudicatedOption.hasVote) return undefined;
      if (adjudicatedOption.candidateType === 'official-candidate') {
        return find(
          (contest as CandidateContest).candidates,
          (c) => c.id === adjudicatedOption.candidateId
        ).name;
      }
      return adjudicatedOption.candidateName;
    })();

    const writeInPrefix =
      !writeInRecord ||
      writeInRecord.isUnmarked ||
      writeInRecord.isUndetected ||
      hasMarginalMark
        ? 'Ambiguous Write-In'
        : 'Write-In';

    if (candidateName) {
      return (
        <StatusLineAdjudicated>
          <Font weight="semiBold">{writeInPrefix} </Font>adjudicated for
          <Font weight="semiBold"> {candidateName}</Font>
        </StatusLineAdjudicated>
      );
    }
    return (
      <StatusLineAdjudicated>
        <Font weight="semiBold">{writeInPrefix} </Font>adjudicated as
        <Font weight="semiBold"> Invalid</Font>
      </StatusLineAdjudicated>
    );
  }

  const currentVote = getCurrentVote(option, adjudicatedOption);

  if (hasMarginalMark) {
    const newValue = currentVote ? 'Valid' : 'Invalid';
    return (
      <StatusLineAdjudicated>
        <Font weight="semiBold">Marginal Mark </Font>for
        <Font weight="semiBold"> {definition.name} </Font>
        adjudicated as
        <Font weight="semiBold"> {newValue}</Font>
      </StatusLineAdjudicated>
    );
  }

  if (currentVote !== scannedVote) {
    const preface = currentVote ? 'Undetected Mark' : 'Mark';
    const newValue = currentVote ? 'Valid' : 'Invalid';
    return (
      <StatusLineAdjudicated>
        <Font weight="semiBold">{preface} </Font>for
        <Font weight="semiBold"> {definition.name} </Font>
        adjudicated as
        <Font weight="semiBold"> {newValue}</Font>
      </StatusLineAdjudicated>
    );
  }
}

function ContestAdjudicationSummary({
  item,
  showUndervoteStatus,
  adjudicatedContest,
}: {
  item: ContestListItem;
  showUndervoteStatus: boolean;
  adjudicatedContest?: AdjudicatedCvrContest;
}): JSX.Element | null {
  if (!adjudicatedContest) {
    const { tag } = item.adjudicationData;
    const writeIns = item.adjudicationData.options.filter(
      (option) => option.writeInRecord
    ).length;
    const marginalMarks = item.adjudicationData.options.filter(
      (option) => option.hasMarginalMark
    ).length;
    return (
      <React.Fragment>
        {tag?.hasOvervote && (
          <StatusLineNeedsAdjudication>
            Overvote to adjudicate
          </StatusLineNeedsAdjudication>
        )}
        {tag?.hasUndervote && (
          <StatusLineNeedsAdjudication>
            Undervote to adjudicate
          </StatusLineNeedsAdjudication>
        )}
        {writeIns > 0 && (
          <StatusLineNeedsAdjudication>
            {writeIns} {pluralize('write-in', writeIns)} to adjudicate
          </StatusLineNeedsAdjudication>
        )}
        {tag?.hasMarginalMark && (
          <StatusLineNeedsAdjudication>
            {marginalMarks} {pluralize('marginal mark', marginalMarks)} to
            adjudicate
          </StatusLineNeedsAdjudication>
        )}
      </React.Fragment>
    );
  }

  const contestLine = getAdjudicatedContestStatusLine(
    item,
    showUndervoteStatus,
    adjudicatedContest
  );
  const optionLines = item.adjudicationData.options.map((option) => (
    <React.Fragment key={option.definition.id}>
      {getAdjudicatedOptionStatusLine(
        option,
        item.contest,
        adjudicatedContest.adjudicatedContestOptionById[option.definition.id]
      )}
    </React.Fragment>
  ));
  return (
    <React.Fragment>
      {contestLine}
      {optionLines}
    </React.Fragment>
  );
}

function BallotSideContestList({
  adjudicatedContests,
  contests,
  election,
  firstUnresolvedContestId,
  isVisibleSide,
  isBlankBallot,
  onHeaderClick,
  onHover,
  onSelect,
  showUndervoteStatus,
  title,
}: {
  adjudicatedContests: ReadonlyMap<ContestId, AdjudicatedCvrContest>;
  contests: ContestListItem[];
  election: Election;
  firstUnresolvedContestId?: ContestId;
  isVisibleSide: boolean;
  isBlankBallot?: boolean;
  onHeaderClick: () => void;
  onHover: (contestId: ContestId | null) => void;
  onSelect: (contestId: ContestId) => void;
  showUndervoteStatus: boolean;
  title: string;
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
          onPress={onHeaderClick}
          disabled={isVisibleSide}
          icon="Search"
        >
          View
        </ViewSideButton>
      </EntityList.Header>
      <EntityList.Items>
        {contests.map((item) => {
          const { contest, adjudicationData } = item;
          const { tag } = adjudicationData;
          const adjudicatedContest = adjudicatedContests.get(contest.id);
          const isResolved = isContestResolved(
            adjudicationData,
            adjudicatedContests
          );
          const isPending = !isResolved;
          const isFirstUnresolved = contest.id === firstUnresolvedContestId;
          const isOnlyUndervote = tag && isContestTagOnlyUndervote(tag);

          const suppressContestAdjudicationInfo =
            isBlankBallot &&
            isOnlyUndervote &&
            adjudicatedContest === undefined;

          return (
            <EntityList.Item
              id={contest.id}
              key={contest.id}
              onSelect={onSelect}
              onHover={onHover}
              autoScrollIntoView={isFirstUnresolved}
              hasWarning={isPending && !suppressContestAdjudicationInfo}
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
                {!suppressContestAdjudicationInfo && (
                  <ContestAdjudicationSummary
                    item={item}
                    showUndervoteStatus={showUndervoteStatus}
                    adjudicatedContest={adjudicatedContest}
                  />
                )}
              </Column>
            </EntityList.Item>
          );
        })}
      </EntityList.Items>
    </React.Fragment>
  );
}

export interface AdjudicationContestListProps {
  adjudicatedContests: ReadonlyMap<ContestId, AdjudicatedCvrContest>;
  backContests: ContestListItem[];
  cvrTag?: CvrTag;
  election: Election;
  frontContests: ContestListItem[];
  isResolved: boolean;
  onHover: (contestId: ContestId | null) => void;
  onSelect: (contestId: ContestId) => void;
  onSelectSide: (side: Side) => void;
  selectedSide: Side;
  showUndervoteStatus: boolean;
}

export function AdjudicationContestList({
  adjudicatedContests,
  backContests,
  cvrTag,
  election,
  frontContests,
  isResolved,
  onHover,
  onSelect,
  onSelectSide,
  selectedSide,
  showUndervoteStatus,
}: AdjudicationContestListProps): React.ReactNode {
  const allContests = [...frontContests, ...backContests];
  const firstUnresolvedContestId = cvrTag?.isBlankBallot
    ? undefined
    : allContests.find(
        (item) => !isContestResolved(item.adjudicationData, adjudicatedContests)
      )?.contest.id;

  const blankBallotHasAnyAdjudicatedVote =
    cvrTag?.isBlankBallot &&
    allContests.some((item) =>
      item.adjudicationData.options.some((o) =>
        getCurrentVote(
          o,
          adjudicatedContests.get(item.contest.id)
            ?.adjudicatedContestOptionById[o.definition.id]
        )
      )
    );

  const blankBallotCalloutTitle = (() => {
    if (!cvrTag?.isBlankBallot) return undefined;
    if (blankBallotHasAnyAdjudicatedVote) {
      return 'Blank Ballot Resolved';
    }
    return isResolved ? 'Blank Ballot Confirmed' : 'Blank Ballot Detected';
  })();

  return (
    <EntityList.Box>
      {cvrTag?.isBlankBallot && (
        <BlankBallotCalloutContainer>
          <Callout
            color={
              blankBallotHasAnyAdjudicatedVote
                ? 'neutral'
                : !isResolved
                ? 'warning'
                : 'primary'
            }
          >
            <CalloutContent>
              <P aria-hidden style={{ lineHeight: 1, marginBottom: 0 }}>
                {isResolved || blankBallotHasAnyAdjudicatedVote ? (
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
                  <ViewSideButton
                    onPress={() =>
                      onSelectSide(selectedSide === 'front' ? 'back' : 'front')
                    }
                    icon="Search"
                  >
                    View {selectedSide === 'front' ? 'Back' : 'Front'}
                  </ViewSideButton>
                )}
              </CalloutBody>
            </CalloutContent>
          </Callout>
        </BlankBallotCalloutContainer>
      )}
      {frontContests.length > 0 && (
        <BallotSideContestList
          adjudicatedContests={adjudicatedContests}
          contests={frontContests}
          election={election}
          firstUnresolvedContestId={firstUnresolvedContestId}
          isBlankBallot={cvrTag?.isBlankBallot}
          isVisibleSide={selectedSide === 'front'}
          onHeaderClick={() => onSelectSide('front')}
          onHover={onHover}
          onSelect={onSelect}
          showUndervoteStatus={showUndervoteStatus}
          title="Front"
        />
      )}
      {backContests.length > 0 && (
        <BallotSideContestList
          adjudicatedContests={adjudicatedContests}
          contests={backContests}
          election={election}
          firstUnresolvedContestId={firstUnresolvedContestId}
          isBlankBallot={cvrTag?.isBlankBallot}
          isVisibleSide={selectedSide === 'back'}
          onHeaderClick={() => onSelectSide('back')}
          onHover={onHover}
          onSelect={onSelect}
          showUndervoteStatus={showUndervoteStatus}
          title="Back"
        />
      )}
    </EntityList.Box>
  );
}
