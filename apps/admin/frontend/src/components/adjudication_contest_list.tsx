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
import { hasCrossoverVote } from '@votingworks/utils';
import pluralize from 'pluralize';
import { EntityList } from './entity_list';
import {
  adjudicatedVotes,
  contestPartyLabel,
  getCurrentVote,
  isContestCrossoverVoted,
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

const CalloutContainer = styled.div`
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

const StatusCaption = styled(EntityList.Caption)<{ color?: 'primary' }>`
  align-items: center;
  display: flex;
  gap: 0.25rem;
  color: ${(p) =>
    p.color === 'primary'
      ? p.theme.colors.primary
      : p.theme.colors.onBackground};
`;

function StatusLine({
  icon,
  children,
  color,
  weight = 'semiBold',
  ...fontProps
}: FontProps &
  React.PropsWithChildren<{
    icon: JSX.Element;
    color?: 'primary';
  }>) {
  return (
    <StatusCaption color={color} weight={weight} {...fontProps}>
      {icon} {children}
    </StatusCaption>
  );
}

const StatusLineNeedsAdjudication = styled(StatusLine).attrs({
  icon: <Icons.PenToSquare color="warning" />,
})`
  /* stylelint-disable-next-line no-empty-source */
`;

const StatusLineWarning = styled(StatusLine).attrs({
  icon: <Icons.Warning color="warning" />,
  color: 'primary',
})`
  /* stylelint-disable-next-line no-empty-source */
`;

const StatusLineConfirmed = styled(StatusLine).attrs({
  icon: <Icons.Done />,
  color: 'primary',
})`
  /* stylelint-disable-next-line no-empty-source */
`;

const StatusLineAdjudicated = styled(StatusLine).attrs({
  icon: <Icons.PenToSquare />,
  weight: 'regular',
  color: 'primary',
})`
  /* stylelint-disable-next-line no-empty-source */
`;

function getVotesAllowed(contest: AnyContest): number {
  return contest.type === 'yesno' ? 1 : contest.seats;
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

function CrossoverVoteStatus({
  ballotHasScannedCrossoverVote,
  contestHasScannedCrossoverVote,
  contestHasAdjudicatedCrossoverVote,
  isBallotResolved,
}: {
  ballotHasScannedCrossoverVote?: boolean;
  contestHasScannedCrossoverVote: boolean;
  contestHasAdjudicatedCrossoverVote: boolean;
  isBallotResolved: boolean;
}) {
  const warningIcon = <Icons.Crossover color="warning" />;
  const primaryIcon = <Icons.Crossover color="primary" />;
  if (ballotHasScannedCrossoverVote) {
    if (contestHasAdjudicatedCrossoverVote) {
      if (isBallotResolved) {
        return (
          <StatusLine icon={primaryIcon} color="primary">
            Crossover vote confirmed
          </StatusLine>
        );
      }
      return (
        <StatusLine icon={warningIcon}>Crossover vote detected</StatusLine>
      );
    }
    if (contestHasScannedCrossoverVote) {
      return <StatusLineConfirmed>Crossover vote resolved</StatusLineConfirmed>;
    }
  }
  if (contestHasAdjudicatedCrossoverVote) {
    return (
      <StatusLine
        icon={isBallotResolved ? primaryIcon : warningIcon}
        color="primary"
      >
        Crossover vote created
      </StatusLine>
    );
  }
}

function BallotSideContestList({
  adjudicatedContests,
  contests,
  election,
  firstUnresolvedContestId,
  isVisibleSide,
  onHeaderClick,
  onHover,
  onSelect,
  showUndervoteStatus,
  title,
  cvrTag,
  ballotHasAdjudicatedCrossoverVote,
  isBallotResolved,
}: {
  adjudicatedContests: ReadonlyMap<ContestId, AdjudicatedCvrContest>;
  contests: ContestListItem[];
  election: Election;
  firstUnresolvedContestId?: ContestId;
  isVisibleSide: boolean;
  onHeaderClick: () => void;
  onHover: (contestId: ContestId | null) => void;
  onSelect: (contestId: ContestId) => void;
  showUndervoteStatus: boolean;
  title: string;
  cvrTag?: CvrTag;
  ballotHasAdjudicatedCrossoverVote: boolean;
  isBallotResolved: boolean;
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
            cvrTag?.isBlankBallot &&
            isOnlyUndervote &&
            adjudicatedContest === undefined;

          const contestHasScannedCrossoverVote = isContestCrossoverVoted(
            cvrTag?.hasCrossoverVote,
            item
          );
          const contestHasAdjudicatedCrossoverVote = isContestCrossoverVoted(
            ballotHasAdjudicatedCrossoverVote,
            item,
            adjudicatedContests
          );
          const crossoverVoteIsPending =
            contestHasScannedCrossoverVote &&
            contestHasAdjudicatedCrossoverVote &&
            !isBallotResolved;

          const partyLabel = contestPartyLabel(election, contest);

          return (
            <EntityList.Item
              id={contest.id}
              key={contest.id}
              onSelect={onSelect}
              onHover={onHover}
              autoScrollIntoView={isFirstUnresolved}
              hasWarning={
                (isPending && !suppressContestAdjudicationInfo) ||
                crossoverVoteIsPending
              }
            >
              <Column>
                <EntityList.Caption>
                  {getContestDistrictName(election, contest)}
                  {partyLabel && ` — ${partyLabel}`}
                </EntityList.Caption>
                <EntityList.Label
                  weight="semiBold"
                  style={{ marginBottom: '0.25rem' }}
                >
                  {contest.title}
                </EntityList.Label>
                <CrossoverVoteStatus
                  contestHasScannedCrossoverVote={
                    contestHasScannedCrossoverVote
                  }
                  contestHasAdjudicatedCrossoverVote={
                    contestHasAdjudicatedCrossoverVote
                  }
                  ballotHasScannedCrossoverVote={cvrTag?.hasCrossoverVote}
                  isBallotResolved={isBallotResolved}
                />
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
  isBallotResolved: boolean;
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
  isBallotResolved,
  onHover,
  onSelect,
  onSelectSide,
  selectedSide,
  showUndervoteStatus,
}: AdjudicationContestListProps): React.ReactNode {
  const allContests = [...frontContests, ...backContests];
  const firstUnresolvedContestId =
    cvrTag?.isBlankBallot || cvrTag?.hasCrossoverVote
      ? undefined
      : allContests.find(
          (item) =>
            !isContestResolved(item.adjudicationData, adjudicatedContests)
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
    return isBallotResolved
      ? 'Blank Ballot Confirmed'
      : 'Blank Ballot Detected';
  })();

  const ballotHasAdjudicatedCrossoverVote = hasCrossoverVote(
    election,
    adjudicatedVotes(allContests, adjudicatedContests)
  );

  return (
    <EntityList.Box>
      {cvrTag?.isBlankBallot && (
        <CalloutContainer>
          <Callout
            color={
              blankBallotHasAnyAdjudicatedVote
                ? 'neutral'
                : !isBallotResolved
                ? 'warning'
                : 'primary'
            }
          >
            <CalloutContent>
              <P aria-hidden style={{ lineHeight: 1, marginBottom: 0 }}>
                {isBallotResolved || blankBallotHasAnyAdjudicatedVote ? (
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
        </CalloutContainer>
      )}
      {cvrTag?.hasCrossoverVote && (
        <CrossoverVotingCallout
          ballotHasAdjudicatedCrossoverVote={ballotHasAdjudicatedCrossoverVote}
          isBallotResolved={isBallotResolved}
        />
      )}
      {frontContests.length > 0 && (
        <BallotSideContestList
          adjudicatedContests={adjudicatedContests}
          contests={frontContests}
          election={election}
          firstUnresolvedContestId={firstUnresolvedContestId}
          isVisibleSide={selectedSide === 'front'}
          onHeaderClick={() => onSelectSide('front')}
          onHover={onHover}
          onSelect={onSelect}
          showUndervoteStatus={showUndervoteStatus}
          title="Front"
          cvrTag={cvrTag}
          ballotHasAdjudicatedCrossoverVote={ballotHasAdjudicatedCrossoverVote}
          isBallotResolved={isBallotResolved}
        />
      )}
      {backContests.length > 0 && (
        <BallotSideContestList
          adjudicatedContests={adjudicatedContests}
          contests={backContests}
          election={election}
          firstUnresolvedContestId={firstUnresolvedContestId}
          isVisibleSide={selectedSide === 'back'}
          onHeaderClick={() => onSelectSide('back')}
          onHover={onHover}
          onSelect={onSelect}
          showUndervoteStatus={showUndervoteStatus}
          title="Back"
          cvrTag={cvrTag}
          ballotHasAdjudicatedCrossoverVote={ballotHasAdjudicatedCrossoverVote}
          isBallotResolved={isBallotResolved}
        />
      )}
    </EntityList.Box>
  );
}

function CrossoverVotingCallout({
  ballotHasAdjudicatedCrossoverVote,
  isBallotResolved,
}: {
  ballotHasAdjudicatedCrossoverVote: boolean;
  isBallotResolved: boolean;
}): JSX.Element | null {
  const { title, description } = (() => {
    if (!ballotHasAdjudicatedCrossoverVote) {
      return {
        title: 'Crossover Voting Resolved',
        description: 'Ballot no longer has votes for multiple parties.',
      };
    }
    if (isBallotResolved) {
      return {
        title: 'Crossover Voting Confirmed',
        description: 'Votes in partisan contests will not be counted.',
      };
    }
    return {
      title: 'Crossover Voting Detected',
      description:
        'Votes detected for multiple parties. Votes in partisan contests will not be counted.',
    };
  })();
  const isAdjudicated = !ballotHasAdjudicatedCrossoverVote || isBallotResolved;
  return (
    <CalloutContainer>
      <Callout color={isAdjudicated ? 'primary' : 'warning'}>
        <CalloutContent>
          <P aria-hidden style={{ lineHeight: 1, marginBottom: 0 }}>
            {isAdjudicated ? (
              <Icons.Done color="primary" />
            ) : (
              <Icons.Crossover color="warning" />
            )}
          </P>
          <CalloutBody>
            <CalloutTitleContainer>
              <CalloutTitle weight="bold">{title}</CalloutTitle>
              <Caption weight="regular" style={{ lineHeight: 1 }}>
                {description}
              </Caption>
            </CalloutTitleContainer>
          </CalloutBody>
        </CalloutContent>
      </Callout>
    </CalloutContainer>
  );
}
