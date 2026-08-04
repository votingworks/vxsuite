import React from 'react';
import styled from 'styled-components';
import {
  Contest,
  CandidateContest,
  ContestId,
  Election,
  getContestDistrictName,
  Side,
} from '@votingworks/types';
import type {
  AdjudicatedContestOption,
  AdjudicatedCvrContest,
  ContestOptionAdjudicationData,
  CvrTag,
} from '@votingworks/admin-backend';
import { find, iter } from '@votingworks/basics';
import { Button, Callout, Caption, FontProps, Icons, P } from '@votingworks/ui';
import pluralize from 'pluralize';
import { contestOptionName } from '@votingworks/utils';
import { EntityList } from './entity_list.js';
import {
  AdjudicatedContests,
  ContestListItem,
  contestPartyLabel,
  BallotCrossoverVoteStatus,
  getCurrentVote,
  isContestTagOnlyUndervote,
} from '../utils/adjudication.js';

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
  ...fontProps
}: FontProps &
  React.PropsWithChildren<{
    icon: JSX.Element;
    color?: 'primary';
  }>) {
  return (
    <StatusCaption color={color} {...fontProps}>
      {icon} {children}
    </StatusCaption>
  );
}

const StatusLineNeedsAdjudication = styled(StatusLine).attrs({
  icon: <Icons.PenToSquare color="warning" fixedWidth />,
})`
  /* stylelint-disable-next-line no-empty-source */
`;

const StatusLineWarning = styled(StatusLine).attrs({
  icon: <Icons.Warning color="warning" fixedWidth />,
  color: 'primary',
})`
  /* stylelint-disable-next-line no-empty-source */
`;

const StatusLineConfirmed = styled(StatusLine).attrs({
  icon: <Icons.Done fixedWidth />,
  color: 'primary',
})`
  /* stylelint-disable-next-line no-empty-source */
`;

const StatusLineAdjudicated = styled(StatusLine).attrs({
  icon: <Icons.PenToSquare fixedWidth />,
  color: 'primary',
})`
  /* stylelint-disable-next-line no-empty-source */
`;

function getVotesAllowed(contest: Contest): number {
  return contest.type === 'candidate' ? contest.seats : 1;
}

type VoteStatus = 'overvote' | 'undervote' | 'normal';

function getVoteStatus(voteCount: number, votesAllowed: number): VoteStatus {
  if (voteCount > votesAllowed) return 'overvote';
  if (voteCount < votesAllowed) return 'undervote';
  return 'normal';
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
      return <StatusLineConfirmed>Overvote confirmed</StatusLineConfirmed>;
    }
    if (originalStatus === 'undervote' && showUndervoteStatus) {
      return <StatusLineConfirmed>Undervote confirmed</StatusLineConfirmed>;
    }
    return null;
  }

  // Overvote resolved
  if (originalStatus === 'overvote' && adjudicatedStatus !== 'overvote') {
    if (adjudicatedStatus === 'undervote' && showUndervoteStatus) {
      return (
        <StatusLineWarning>
          Overvote resolved; undervote created
        </StatusLineWarning>
      );
    }
    return <StatusLineConfirmed>Overvote resolved</StatusLineConfirmed>;
  }

  // New overvote
  if (adjudicatedStatus === 'overvote') {
    return <StatusLineWarning>Overvote created</StatusLineWarning>;
  }

  // Undervote transitions only if enabled
  if (showUndervoteStatus) {
    if (originalStatus === 'undervote' && adjudicatedStatus !== 'undervote') {
      return <StatusLineConfirmed>Undervote resolved</StatusLineConfirmed>;
    }
    return <StatusLineWarning>Undervote created</StatusLineWarning>;
  }
}

function getAdjudicatedOptionStatusLine(
  election: Election,
  option: ContestOptionAdjudicationData,
  contest: Contest,
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
        ? 'Ambiguous write-in'
        : 'Write-in';

    if (candidateName) {
      return (
        <StatusLineAdjudicated>
          {writeInPrefix} adjudicated for {candidateName}
        </StatusLineAdjudicated>
      );
    }
    return (
      <StatusLineAdjudicated>
        {writeInPrefix} adjudicated as invalid
      </StatusLineAdjudicated>
    );
  }

  const currentVote = getCurrentVote(option, adjudicatedOption);

  if (hasMarginalMark) {
    const newValue = currentVote ? 'valid' : 'invalid';
    return (
      <StatusLineAdjudicated>
        Marginal mark for {contestOptionName(election, contest, definition)}{' '}
        adjudicated as {newValue}
      </StatusLineAdjudicated>
    );
  }

  if (currentVote !== scannedVote) {
    const preface = currentVote ? 'Undetected mark' : 'Mark';
    const newValue = currentVote ? 'valid' : 'invalid';
    return (
      <StatusLineAdjudicated>
        {preface} for {contestOptionName(election, contest, definition)}{' '}
        adjudicated as {newValue}
      </StatusLineAdjudicated>
    );
  }
}

function ContestAdjudicationSummary({
  item,
  showUndervoteStatus,
  adjudicatedContest,
  election,
}: {
  item: ContestListItem;
  showUndervoteStatus: boolean;
  adjudicatedContest?: AdjudicatedCvrContest;
  election: Election;
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
        election,
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

function CrossoverVoteStatusLine({
  contestId,
  crossoverVoteStatus,
}: {
  contestId: ContestId;
  crossoverVoteStatus: BallotCrossoverVoteStatus;
}) {
  const { isBallotResolved, ballotHasScannedCrossoverVote } =
    crossoverVoteStatus;
  const contestStatus = crossoverVoteStatus.statusByContest[contestId];
  const warningIcon = <Icons.Crossover color="warning" fixedWidth />;
  const primaryIcon = <Icons.Crossover color="primary" fixedWidth />;
  if (ballotHasScannedCrossoverVote) {
    if (contestStatus.hasCrossoverVoteAfterAdjudication) {
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
    if (contestStatus.hasScannedCrossoverVote) {
      return <StatusLineConfirmed>Crossover vote resolved</StatusLineConfirmed>;
    }
  }
  if (contestStatus.hasCrossoverVoteAfterAdjudication) {
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
  crossoverVoteStatus,
}: {
  adjudicatedContests: AdjudicatedContests;
  contests: ContestListItem[];
  election: Election;
  firstUnresolvedContestId?: ContestId;
  isVisibleSide: boolean;
  onHeaderClick: () => void;
  onHover: (contestId: ContestId | null) => void;
  onSelect: (contestId: ContestId) => void;
  showUndervoteStatus: boolean;
  title: string;
  cvrTag: CvrTag;
  crossoverVoteStatus: BallotCrossoverVoteStatus;
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
          const { contest, adjudicationData, isResolved } = item;
          const { tag } = adjudicationData;
          const adjudicatedContest = adjudicatedContests.get(contest.id);
          const isFirstUnresolved = contest.id === firstUnresolvedContestId;
          const isOnlyUndervote = tag && isContestTagOnlyUndervote(tag);

          const suppressContestAdjudicationInfo =
            cvrTag.isBlankBallot &&
            isOnlyUndervote &&
            adjudicatedContest === undefined;

          const partyLabel = contestPartyLabel(election, contest);

          return (
            <EntityList.Item
              id={contest.id}
              key={contest.id}
              onSelect={onSelect}
              onHover={onHover}
              autoScrollIntoView={isFirstUnresolved}
              hasWarning={
                (!isResolved && !suppressContestAdjudicationInfo) ||
                crossoverVoteStatus.statusByContest[contest.id].isUnresolved
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
                <CrossoverVoteStatusLine
                  contestId={contest.id}
                  crossoverVoteStatus={crossoverVoteStatus}
                />
                {!suppressContestAdjudicationInfo && (
                  <ContestAdjudicationSummary
                    item={item}
                    showUndervoteStatus={showUndervoteStatus}
                    adjudicatedContest={adjudicatedContest}
                    election={election}
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
  adjudicatedContests: AdjudicatedContests;
  contestItems: ContestListItem[];
  firstUnresolvedContestId?: ContestId;
  cvrTag: CvrTag;
  election: Election;
  isBallotResolved: boolean;
  onHover: (contestId: ContestId | null) => void;
  onSelect: (contestId: ContestId) => void;
  onSelectSide: (side: Side) => void;
  selectedSide: Side;
  showUndervoteStatus: boolean;
  crossoverVoteStatus: BallotCrossoverVoteStatus;
}

export function AdjudicationContestList({
  adjudicatedContests,
  contestItems,
  firstUnresolvedContestId,
  cvrTag,
  election,
  isBallotResolved,
  onHover,
  onSelect,
  onSelectSide,
  selectedSide,
  showUndervoteStatus,
  crossoverVoteStatus,
}: AdjudicationContestListProps): React.ReactNode {
  const [frontContests, backContests] = iter(contestItems).partition(
    (item) => item.side === 'front'
  );

  return (
    <EntityList.Box>
      {cvrTag.isBlankBallot && (
        <BlankBallotCallout
          contestItems={contestItems}
          adjudicatedContests={adjudicatedContests}
          isBallotResolved={isBallotResolved}
          selectedSide={selectedSide}
          onSelectSide={onSelectSide}
        />
      )}
      {cvrTag.hasCrossoverVote && (
        <CrossoverVotingCallout {...crossoverVoteStatus} />
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
          crossoverVoteStatus={crossoverVoteStatus}
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
          crossoverVoteStatus={crossoverVoteStatus}
        />
      )}
    </EntityList.Box>
  );
}

function BlankBallotCallout({
  contestItems,
  adjudicatedContests,
  isBallotResolved,
  selectedSide,
  onSelectSide,
}: {
  contestItems: ContestListItem[];
  adjudicatedContests: AdjudicatedContests;
  isBallotResolved: boolean;
  selectedSide: Side;
  onSelectSide: (side: Side) => void;
}): JSX.Element {
  const ballotHasAnyAdjudicatedVote = contestItems.some((item) =>
    item.adjudicationData.options.some((o) =>
      getCurrentVote(
        o,
        adjudicatedContests.get(item.contest.id)?.adjudicatedContestOptionById[
          o.definition.id
        ]
      )
    )
  );

  const blankBallotCalloutTitle = (() => {
    if (ballotHasAnyAdjudicatedVote) {
      return 'Blank Ballot Resolved';
    }
    return isBallotResolved
      ? 'Blank Ballot Confirmed'
      : 'Blank Ballot Detected';
  })();

  return (
    <CalloutContainer>
      <Callout
        color={
          ballotHasAnyAdjudicatedVote
            ? 'neutral'
            : !isBallotResolved
            ? 'warning'
            : 'primary'
        }
      >
        <CalloutContent>
          <P aria-hidden style={{ lineHeight: 1, marginBottom: 0 }}>
            {isBallotResolved || ballotHasAnyAdjudicatedVote ? (
              <Icons.Done
                color={ballotHasAnyAdjudicatedVote ? 'neutral' : 'primary'}
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
              {ballotHasAnyAdjudicatedVote && (
                <Caption weight="regular" style={{ lineHeight: 1 }}>
                  At least one contest now has a valid vote
                </Caption>
              )}
            </CalloutTitleContainer>
            {!ballotHasAnyAdjudicatedVote && (
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
  );
}

function CrossoverVotingCallout({
  ballotHasCrossoverVoteAfterAdjudication,
  isBallotResolved,
}: BallotCrossoverVoteStatus): JSX.Element | null {
  const { title, description } = (() => {
    if (!ballotHasCrossoverVoteAfterAdjudication) {
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
  const isAdjudicated =
    !ballotHasCrossoverVoteAfterAdjudication || isBallotResolved;
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
