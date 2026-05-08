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
  AdjudicatedContestOption,
  AdjudicatedCvrContest,
  ContestAdjudicationData,
  ContestOptionAdjudicationData,
  CvrTag,
} from '@votingworks/admin-backend';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import {
  Button,
  Callout,
  Caption,
  DesktopPalette,
  Font,
  Icons,
  P,
} from '@votingworks/ui';
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

function getAdjudicatedVote(
  option: ContestOptionAdjudicationData,
  unsavedAdjudication?: AdjudicatedContestOption
): boolean {
  if (unsavedAdjudication) return unsavedAdjudication.hasVote;
  const { scannedVote, adjudicatedVote, writeInRecord } = option;
  if (writeInRecord && writeInRecord.status === 'adjudicated') {
    return writeInRecord.adjudicationType !== 'invalid';
  }
  return adjudicatedVote ?? scannedVote;
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

function getStatusLine(
  item: ContestListItem,
  showUndervoteStatus: boolean,
  unsavedAdjudication?: AdjudicatedCvrContest
): React.ReactNode {
  const votesAllowed = getVotesAllowed(item.contest);

  const originalVoteCount = item.adjudicationData.options.filter(
    (o) => o.scannedVote
  ).length;
  const adjudicatedVoteCount = item.adjudicationData.options.filter((o) =>
    getAdjudicatedVote(
      o,
      unsavedAdjudication?.adjudicatedContestOptionById[o.definition.id]
    )
  ).length;

  const originalStatus = getVoteStatus(originalVoteCount, votesAllowed);
  const adjudicatedStatus = getVoteStatus(adjudicatedVoteCount, votesAllowed);

  if (originalStatus === adjudicatedStatus) {
    if (originalStatus === 'overvote') {
      return 'Overvote Confirmed';
    }
    if (originalStatus === 'undervote' && showUndervoteStatus) {
      return 'Undervote Confirmed';
    }
    return null;
  }

  // Overvote resolved
  if (originalStatus === 'overvote' && adjudicatedStatus !== 'overvote') {
    if (adjudicatedStatus === 'undervote' && showUndervoteStatus) {
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
  if (showUndervoteStatus) {
    if (originalStatus === 'undervote' && adjudicatedStatus !== 'undervote') {
      return 'Undervote Resolved';
    }
    return (
      <StatusLine>
        <Icons.Warning color="warning" />
        Undervote Created
      </StatusLine>
    );
  }

  return null;
}

function getOptionResolutionLine(
  option: ContestOptionAdjudicationData,
  contest: AnyContest,
  writeInCandidateNamesById: Map<Id, string>,
  unsavedAdjudication?: AdjudicatedContestOption
): React.ReactNode | undefined {
  const { definition, scannedVote, hasMarginalMark, writeInRecord } = option;

  const isAdjudicatedWriteIn = unsavedAdjudication
    ? unsavedAdjudication.type === 'write-in-option' &&
      (unsavedAdjudication.hasVote || !!writeInRecord)
    : writeInRecord?.status === 'adjudicated';

  if (isAdjudicatedWriteIn) {
    const candidateName: string | undefined = (() => {
      if (unsavedAdjudication) {
        assert(unsavedAdjudication.type === 'write-in-option');
        if (!unsavedAdjudication.hasVote) return undefined;
        return unsavedAdjudication.candidateType === 'official-candidate'
          ? assertDefined(
              (contest as CandidateContest).candidates.find(
                (c) => c.id === unsavedAdjudication.candidateId
              )
            ).name
          : unsavedAdjudication.candidateName;
      }
      const record = assertDefined(writeInRecord);
      assert(record.status === 'adjudicated');
      switch (record.adjudicationType) {
        case 'official-candidate':
          return assertDefined(
            (contest as CandidateContest).candidates.find(
              (c) => c.id === record.candidateId
            )
          ).name;
        case 'write-in-candidate':
          return assertDefined(
            writeInCandidateNamesById.get(record.candidateId)
          );
        case 'invalid':
          return undefined;
        /* istanbul ignore next - @preserve */
        default:
          throwIllegalValue(record, 'adjudicationType');
      }
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
        <span>
          <Font weight="semiBold">{writeInPrefix} </Font>adjudicated for
          <Font weight="semiBold"> {candidateName}</Font>
        </span>
      );
    }
    return (
      <span>
        <Font weight="semiBold">{writeInPrefix} </Font>adjudicated as
        <Font weight="semiBold"> Invalid</Font>
      </span>
    );
  }

  const currentVote = getAdjudicatedVote(option, unsavedAdjudication);

  if (hasMarginalMark) {
    const newValue = currentVote ? 'Valid' : 'Invalid';
    return (
      <span>
        <Font weight="semiBold">Marginal Mark </Font>for
        <Font weight="semiBold"> {definition.name} </Font>
        adjudicated as
        <Font weight="semiBold"> {newValue}</Font>
      </span>
    );
  }

  if (currentVote !== scannedVote) {
    const preface = currentVote ? 'Undetected Mark' : 'Mark';
    const newValue = currentVote ? 'Valid' : 'Invalid';
    return (
      <span>
        <Font weight="semiBold">{preface} </Font>for
        <Font weight="semiBold"> {definition.name} </Font>
        adjudicated as
        <Font weight="semiBold"> {newValue}</Font>
      </span>
    );
  }

  return undefined;
}

function ContestAdjudicationSummary({
  item,
  showUndervoteStatus,
  writeInCandidateNamesById,
  unsavedAdjudication,
}: {
  item: ContestListItem;
  showUndervoteStatus: boolean;
  writeInCandidateNamesById: Map<Id, string>;
  unsavedAdjudication?: AdjudicatedCvrContest;
}): JSX.Element | null {
  const statusLine = getStatusLine(
    item,
    showUndervoteStatus,
    unsavedAdjudication
  );
  const bullets = item.adjudicationData.options
    .map((option) =>
      getOptionResolutionLine(
        option,
        item.contest,
        writeInCandidateNamesById,
        unsavedAdjudication?.adjudicatedContestOptionById[option.definition.id]
      )
    )
    .filter((desc): desc is React.ReactNode => desc !== undefined);

  if (!statusLine && bullets.length === 0) return null;

  return (
    <React.Fragment>
      {statusLine && (
        <ResolvedCaption weight="semiBold">{statusLine}</ResolvedCaption>
      )}
      {bullets.map((bullet, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <ResolvedCaption key={i}>&bull; {bullet}</ResolvedCaption>
      ))}
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
  writeInCandidateNamesById,
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
          const unsavedAdjudication = adjudicatedContests.get(contest.id);
          const isResolved = isContestResolved(
            adjudicationData,
            adjudicatedContests
          );
          const isPending = !isResolved;
          const isFirstUnresolved = contest.id === firstUnresolvedContestId;
          const isOnlyUndervote = tag && isContestTagOnlyUndervote(tag);

          const hasVoteAdjudication =
            unsavedAdjudication !== undefined ||
            adjudicationData.options.some(
              (o) => o.adjudicatedVote !== undefined
            );
          const suppressContestAdjudicationInfo =
            isBlankBallot && isOnlyUndervote && !hasVoteAdjudication;

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
                {tag && isResolved && !suppressContestAdjudicationInfo && (
                  <ContestAdjudicationSummary
                    item={item}
                    showUndervoteStatus={showUndervoteStatus}
                    writeInCandidateNamesById={writeInCandidateNamesById}
                    unsavedAdjudication={unsavedAdjudication}
                  />
                )}
              </Column>
              {isPending && !suppressContestAdjudicationInfo && (
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
  adjudicatedContests: ReadonlyMap<ContestId, AdjudicatedCvrContest>;
  backContests: ContestListItem[];
  cvrTag?: CvrTag;
  election: Election;
  frontContests: ContestListItem[];
  onHover: (contestId: ContestId | null) => void;
  onSelect: (contestId: ContestId) => void;
  onSelectSide: (side: Side) => void;
  selectedSide: Side;
  showUndervoteStatus: boolean;
  writeInCandidateNamesById: Map<Id, string>;
}

export function AdjudicationContestList({
  adjudicatedContests,
  backContests,
  cvrTag,
  election,
  frontContests,
  onHover,
  onSelect,
  onSelectSide,
  selectedSide,
  showUndervoteStatus,
  writeInCandidateNamesById,
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
        getAdjudicatedVote(
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
          writeInCandidateNamesById={writeInCandidateNamesById}
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
          writeInCandidateNamesById={writeInCandidateNamesById}
        />
      )}
    </EntityList.Box>
  );
}
