import React, {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';
import {
  Candidate,
  ContestOptionId,
  getContestDistrictName,
  getOrderedCandidatesForContestInBallotStyle,
  YesNoOption,
} from '@votingworks/types';
import {
  Button,
  Main,
  Screen,
  Font,
  Loading,
  Icons,
  H2,
  H1,
  P,
} from '@votingworks/ui';
import {
  assert,
  assertDefined,
  find,
  iter,
  throwIllegalValue,
  uniqueBy,
} from '@votingworks/basics';
import type {
  AdjudicatedContestOption,
  AdjudicatedCvrContest,
  WriteInRecord,
} from '@votingworks/admin-backend';
import {
  allContestOptions,
  format,
  getBallotStyleGroup,
} from '@votingworks/utils';
import { useHistory, useParams } from 'react-router-dom';
import {
  getCastVoteRecordVoteInfo,
  getBallotImageView,
  getNextCvrIdForAdjudication,
  getWriteIns,
  getAdjudicationQueue,
  getWriteInCandidates,
  getVoteAdjudications,
  adjudicateCvrContest,
  getMarginalMarks,
  getCvrContestTag,
} from '../api';
import { AppContext } from '../contexts/app_context';
import { ContestAdjudicationScreenParams } from '../config/types';
import { routerPaths } from '../router_paths';
import {
  BallotStaticImageViewer,
  BallotZoomImageViewer,
} from '../components/adjudication_ballot_image_viewer';
import { WriteInAdjudicationButton } from '../components/write_in_adjudication_button';
import { NavigationScreen } from '../components/navigation_screen';
import { ContestOptionButton } from '../components/contest_option_button';
import { getOptionCoordinates } from '../utils/adjudication';
import {
  DoubleVoteAlert,
  DoubleVoteAlertModal,
} from '../components/adjudication_double_vote_alert_modal';
import { DiscardChangesModal } from '../components/discard_changes_modal';
import {
  useContestAdjudicationState,
  isWriteInPending,
  isWriteInInvalid,
  isMarginalMarkPending,
  isOfficialCandidate,
  isValidCandidate,
  MarginalMarkStatus,
  WriteInAdjudicationStatus,
} from '../hooks/use_contest_adjudication_state';

const DEFAULT_PADDING = '0.75rem';
// Update the corresponding constant in 'components/adjudication_ballot_image_viewer.tsx' if this changes
const ADJUDICATION_PANEL_WIDTH = '23.5rem';

const BallotPanel = styled.div`
  background: black;
  flex: 1;
`;

const AdjudicationPanel = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: ${ADJUDICATION_PANEL_WIDTH};
  border-left: 4px solid black;
`;

const AdjudicationPanelOverlay = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  height: 100vh;
  width: ${ADJUDICATION_PANEL_WIDTH};
  z-index: 5;
  backdrop-filter: blur(1px);
  background: rgba(0, 0, 0, 50%);
`;

const BaseRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${DEFAULT_PADDING};
`;

const BallotHeader = styled(BaseRow)`
  background: ${(p) => p.theme.colors.inverseBackground};
  color: ${(p) => p.theme.colors.onInverse};
  align-items: start;
  min-height: 4rem;
  flex-shrink: 0;

  button {
    flex-wrap: nowrap;
    font-weight: 600;
  }
`;

const BallotVoteCount = styled(BaseRow)`
  background: ${(p) => p.theme.colors.containerHigh};
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  justify-content: space-between;
`;

const BallotFooter = styled(BaseRow)`
  flex-direction: column;
  justify-content: start;
  align-items: stretch;
  gap: 0.5rem;
  background: ${(p) => p.theme.colors.container};
  border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  width: 100%;
`;

const BallotMetadata = styled(BaseRow)`
  padding: 0;
`;

const BallotNavigation = styled(BaseRow)`
  gap: 0.5rem;
  padding: 0;

  /* row-reverse allows tabbing to go from primary to secondary actions */
  flex-direction: row-reverse;

  button {
    flex-wrap: nowrap;
  }
`;

const ContestOptionButtonList = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
  background: ${(p) => p.theme.colors.background};
  flex-grow: 1;
  padding: ${DEFAULT_PADDING};
  overflow-y: scroll;
`;

const ContestOptionButtonCaption = styled.span`
  color: ${(p) => p.theme.colors.primary};
  font-size: 0.75rem;
  margin: 0.25rem 0 0.25rem 0.125rem;
`;

const ContestTitleDiv = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`;

const CompactH1 = styled(H1)`
  font-size: 1.125rem;
  margin: 0;
`;

const CompactH2 = styled(H2)`
  font-size: 0.875rem;
  margin: 0;
`;

const MediumText = styled(P)`
  font-weight: 700;
  line-height: 1;
  margin: 0;
`;

const SmallText = styled(P)`
  color: ${(p) => p.theme.colors.onBackgroundMuted};
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1;
  margin: 0;
`;

const Label = styled.span`
  color: ${(p) => p.theme.colors.inverseBackground};
  font-size: 1rem;
  font-weight: 500;
`;

const PrimaryNavButton = styled(Button)`
  flex-grow: 1;
`;

const SecondaryNavButton = styled(Button)`
  width: 5.5rem;
`;

function renderContestOptionButtonCaption({
  originalVote,
  currentVote,
  isWriteIn,
  writeInStatus,
  writeInRecord,
  marginalMarkStatus,
}: {
  originalVote: boolean;
  currentVote: boolean;
  isWriteIn: boolean;
  writeInStatus?: WriteInAdjudicationStatus;
  writeInRecord?: WriteInRecord;
  marginalMarkStatus?: MarginalMarkStatus;
}) {
  let originalValueStr: string | undefined;
  if (isWriteIn) {
    const isAmbiguousAndAdjudicated =
      (!writeInRecord && isValidCandidate(writeInStatus)) || // No write in detected by scanner but adjudicated as vote
      ((writeInRecord?.isUnmarked ||
        writeInRecord?.isUndetected ||
        marginalMarkStatus === 'resolved') &&
        !isWriteInPending(writeInStatus));
    if (isAmbiguousAndAdjudicated) {
      originalValueStr = 'Ambiguous Write-In';
    } else if (originalVote && isWriteInInvalid(writeInStatus)) {
      originalValueStr = 'Write-In';
    }
  } else if (marginalMarkStatus === 'resolved') {
    originalValueStr = 'Marginal Mark';
  } else if (originalVote !== currentVote) {
    originalValueStr = originalVote ? 'Mark' : 'Undetected Mark';
  }

  if (!originalValueStr) {
    return null;
  }
  const newValueStr = currentVote ? 'Valid' : 'Invalid';
  return (
    <ContestOptionButtonCaption>
      <Font weight="semiBold">{originalValueStr} </Font>adjudicated as
      <Font weight="semiBold"> {newValueStr}</Font>
    </ContestOptionButtonCaption>
  );
}

export function ContestAdjudicationScreen(): JSX.Element {
  const history = useHistory();
  const { contestId } = useParams<ContestAdjudicationScreenParams>();
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  const contest = find(election.contests, (c) => c.id === contestId);
  const isCandidateContest = contest.type === 'candidate';

  // Queries and mutations
  const cvrQueueQuery = getAdjudicationQueue.useQuery({ contestId });
  const firstPendingCvrIdQuery = getNextCvrIdForAdjudication.useQuery({
    contestId,
  });

  const [maybeCvrQueueIndex, setMaybeCvrQueueIndex] = useState<number>();
  const isQueueReady =
    maybeCvrQueueIndex !== undefined && cvrQueueQuery.data !== undefined;
  const maybeCurrentCvrId = isQueueReady
    ? cvrQueueQuery.data[maybeCvrQueueIndex]
    : undefined;

  const cvrVoteInfoQuery = getCastVoteRecordVoteInfo.useQuery(
    maybeCurrentCvrId ? { cvrId: maybeCurrentCvrId } : undefined
  );
  const voteAdjudicationsQuery = getVoteAdjudications.useQuery(
    maybeCurrentCvrId ? { cvrId: maybeCurrentCvrId, contestId } : undefined
  );
  const writeInsQuery = getWriteIns.useQuery(
    maybeCurrentCvrId ? { cvrId: maybeCurrentCvrId, contestId } : undefined
  );
  const ballotImageViewQuery = getBallotImageView.useQuery(
    maybeCurrentCvrId ? { cvrId: maybeCurrentCvrId, contestId } : undefined
  );
  const writeInCandidatesQuery = getWriteInCandidates.useQuery({
    contestId,
  });
  const marginalMarksQuery = getMarginalMarks.useQuery(
    maybeCurrentCvrId ? { cvrId: maybeCurrentCvrId, contestId } : undefined
  );
  const cvrContestTagQuery = getCvrContestTag.useQuery(
    maybeCurrentCvrId ? { cvrId: maybeCurrentCvrId, contestId } : undefined
  );

  const areQueriesFetching =
    cvrVoteInfoQuery.isFetching ||
    cvrQueueQuery.isFetching ||
    firstPendingCvrIdQuery.isFetching ||
    ballotImageViewQuery.isFetching ||
    writeInsQuery.isFetching ||
    writeInCandidatesQuery.isFetching ||
    voteAdjudicationsQuery.isFetching ||
    marginalMarksQuery.isFetching ||
    cvrContestTagQuery.isFetching;

  const adjudicateCvrContestMutation = adjudicateCvrContest.useMutation();

  const officialOptions = useMemo(() => {
    if (!cvrVoteInfoQuery.data) {
      return [];
    }
    const ballotStyleGroup = assertDefined(
      getBallotStyleGroup({
        ballotStyleGroupId: cvrVoteInfoQuery.data.ballotStyleGroupId,
        election,
      })
    );
    return isCandidateContest
      ? uniqueBy(
          getOrderedCandidatesForContestInBallotStyle({
            contest,
            ballotStyle: ballotStyleGroup,
          }),
          (c) => c.id
        ).filter((c) => !c.isWriteIn)
      : [contest.yesOption, contest.noOption];
  }, [contest, isCandidateContest, cvrVoteInfoQuery.data, election]);

  const writeInOptionIds = useMemo(
    () =>
      isCandidateContest
        ? iter(allContestOptions(contest))
            .filterMap((option) => (option.isWriteIn ? option.id : undefined))
            .toArray()
        : [],
    [contest, isCandidateContest]
  );

  const {
    resetState,
    isStateReady,
    isModified,
    getOptionHasVote,
    setOptionHasVote,
    getOptionWriteInStatus,
    setOptionWriteInStatus,
    getOptionMarginalMarkStatus,
    resolveOptionMarginalMark,
    checkWriteInNameForDoubleVote,
    allAdjudicationsCompleted,
    firstOptionIdPendingAdjudication,
    selectedCandidateNames,
    voteCount,
  } = useContestAdjudicationState(
    {
      isCandidateContest,
      numberOfWriteIns: isCandidateContest ? contest.seats : 0,
      officialOptions,
    },
    !maybeCurrentCvrId || areQueriesFetching
      ? undefined
      : {
          votes: cvrVoteInfoQuery.data?.votes[contestId],
          writeIns: writeInsQuery.data,
          writeInCandidates: writeInCandidatesQuery.data,
          voteAdjudications: voteAdjudicationsQuery.data,
          marginalMarks: marginalMarksQuery.data,
          contestTag: cvrContestTagQuery.data,
        }
  );

  // Vote and write-in state for adjudication management
  const [focusedOptionId, setFocusedOptionId] = useState<string>();
  const [shouldScrollToTarget, setShouldScrollToTarget] = useState(false);
  const [doubleVoteAlert, setDoubleVoteAlert] = useState<DoubleVoteAlert>();
  const [discardChangesNextAction, setDiscardChangesNextAction] = useState<
    'close' | 'back' | 'skip'
  >();

  // Open to first pending cvr when queue data is loaded
  useEffect(() => {
    if (
      maybeCvrQueueIndex === undefined &&
      cvrQueueQuery.isSuccess &&
      firstPendingCvrIdQuery.isSuccess
    ) {
      const cvrQueue = cvrQueueQuery.data;
      const cvrId = firstPendingCvrIdQuery.data;
      if (cvrId) {
        setMaybeCvrQueueIndex(cvrQueue.indexOf(cvrId));
      } else {
        setMaybeCvrQueueIndex(0);
      }
    }
  }, [firstPendingCvrIdQuery, cvrQueueQuery, maybeCvrQueueIndex]);

  // Prefetch the next and previous ballot images
  const prefetchImageViews = getBallotImageView.usePrefetch();
  useEffect(() => {
    if (!cvrQueueQuery.isSuccess || maybeCvrQueueIndex === undefined) return;
    const nextCvrId = cvrQueueQuery.data[maybeCvrQueueIndex + 1];
    if (nextCvrId) {
      void prefetchImageViews({ cvrId: nextCvrId, contestId });
    }
    const prevCvrId = cvrQueueQuery.data[maybeCvrQueueIndex - 1];
    if (prevCvrId) {
      void prefetchImageViews({ cvrId: prevCvrId, contestId });
    }
  }, [contestId, maybeCvrQueueIndex, cvrQueueQuery, prefetchImageViews]);

  // Allow escape key to dismiss focused option or modal
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (focusedOptionId) {
          (document.activeElement as HTMLElement)?.blur();
          setFocusedOptionId(undefined);
        }
        setDiscardChangesNextAction(undefined);
        setDoubleVoteAlert(undefined);
      }
    }
    window.addEventListener('keydown', handleEscape, { capture: true });
    return () =>
      window.removeEventListener('keydown', handleEscape, { capture: true });
  }, [doubleVoteAlert, discardChangesNextAction, focusedOptionId]);

  // On initial load OR ballot navigation: scroll user to first pending adjudication
  const scrollTargetRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (
      !areQueriesFetching &&
      firstOptionIdPendingAdjudication &&
      shouldScrollToTarget
    ) {
      scrollTargetRef.current?.scrollIntoView({
        behavior: 'instant',
        block: 'start',
      });
      setShouldScrollToTarget(false);
    }
  }, [
    areQueriesFetching,
    firstOptionIdPendingAdjudication,
    shouldScrollToTarget,
  ]);

  // Only show full loading screen on initial load to mitigate screen flicker on scroll
  if (
    !isQueueReady ||
    !maybeCurrentCvrId ||
    !cvrVoteInfoQuery.data ||
    !writeInCandidatesQuery.data ||
    !writeInsQuery.data ||
    !voteAdjudicationsQuery.data ||
    !ballotImageViewQuery.data ||
    !marginalMarksQuery.data ||
    !cvrContestTagQuery.data
  ) {
    return (
      <NavigationScreen title="Contest Adjudication">
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  const originalVotes = cvrVoteInfoQuery.data.votes[contestId];
  const writeIns = writeInsQuery.data;
  const ballotImage = ballotImageViewQuery.data;
  const writeInCandidates = writeInCandidatesQuery.data;
  const cvrContestTag = cvrContestTagQuery.data;
  const cvrQueueIndex = maybeCvrQueueIndex;
  const currentCvrId = maybeCurrentCvrId;

  const seatCount = isCandidateContest ? contest.seats : 1;
  const isOvervote = voteCount > seatCount;
  const isUndervote = voteCount < seatCount;

  const allowSaveWithoutChanges =
    (cvrContestTag.hasOvervote || cvrContestTag.hasUndervote) &&
    !cvrContestTag.isResolved &&
    allAdjudicationsCompleted;

  const isHmpb = ballotImage.type === 'hmpb';
  const isBmd = ballotImage.type === 'bmd';
  const { side } = ballotImage;
  const focusedCoordinates =
    focusedOptionId && isHmpb
      ? getOptionCoordinates(ballotImage.optionLayouts, focusedOptionId)
      : undefined;

  const numBallots = cvrQueueQuery.data.length;
  const onFirstBallot = cvrQueueIndex === 0;
  const onLastBallot = cvrQueueIndex + 1 === numBallots;

  function clearBallotState(): void {
    resetState();
    setFocusedOptionId(undefined);
    setDoubleVoteAlert(undefined);
    setDiscardChangesNextAction(undefined);
  }

  async function saveAndNext(): Promise<void> {
    const adjudicatedContestOptionById: Record<
      ContestOptionId,
      AdjudicatedContestOption
    > = {};
    const adjudicatedCvrContest: AdjudicatedCvrContest = {
      adjudicatedContestOptionById,
      contestId,
      cvrId: currentCvrId,
      side,
    };
    const officialOptionIds = officialOptions.map((o) => o.id);
    for (const optionId of officialOptionIds) {
      const hasVote = getOptionHasVote(optionId);
      adjudicatedContestOptionById[optionId] = {
        type: 'candidate-option',
        hasVote,
      };
    }
    for (const optionId of writeInOptionIds) {
      const writeInStatus = getOptionWriteInStatus(optionId);
      // throw error if there is a pending write-in
      assert(!isWriteInPending(writeInStatus));
      if (isWriteInInvalid(writeInStatus) || !writeInStatus) {
        adjudicatedContestOptionById[optionId] = {
          type: 'write-in-option',
          hasVote: false,
        };
      } else if (isOfficialCandidate(writeInStatus)) {
        adjudicatedContestOptionById[optionId] = {
          type: 'write-in-option',
          hasVote: true,
          candidateType: 'official-candidate',
          candidateId: writeInStatus.id,
        };
      } else {
        adjudicatedContestOptionById[optionId] = {
          type: 'write-in-option',
          hasVote: true,
          candidateType: 'write-in-candidate',
          candidateName: writeInStatus.name,
        };
      }
    }
    try {
      await adjudicateCvrContestMutation.mutateAsync(adjudicatedCvrContest);
      if (onLastBallot) {
        history.push(routerPaths.adjudication);
      } else {
        setMaybeCvrQueueIndex(cvrQueueIndex + 1);
        clearBallotState();
      }
    } catch {
      // Handled by default query client error handling
    }
  }

  function onSkip(): void {
    if (onLastBallot) return;
    if (isModified && !discardChangesNextAction) {
      setDiscardChangesNextAction('skip');
      return;
    }
    setMaybeCvrQueueIndex(cvrQueueIndex + 1);
    clearBallotState();
  }

  function onBack(): void {
    if (onFirstBallot) return;
    if (isModified && !discardChangesNextAction) {
      setDiscardChangesNextAction('back');
      return;
    }
    setMaybeCvrQueueIndex(cvrQueueIndex - 1);
    clearBallotState();
  }

  function onClose(): void {
    if (isModified && !discardChangesNextAction) {
      setDiscardChangesNextAction('close');
      return;
    }
    history.push(routerPaths.adjudication);
  }

  return (
    <Screen>
      <Main flexRow data-testid={`transcribe:${currentCvrId}`}>
        <BallotPanel>
          {isHmpb && (
            <BallotZoomImageViewer
              ballotBounds={ballotImage.ballotCoordinates}
              key={currentCvrId} // Reset zoom state for each write-in
              imageUrl={ballotImage.imageUrl}
              zoomedInBounds={
                focusedCoordinates || ballotImage.contestCoordinates
              }
            />
          )}
          {isBmd && <BallotStaticImageViewer imageUrl={ballotImage.imageUrl} />}
        </BallotPanel>
        <AdjudicationPanel>
          {focusedOptionId && <AdjudicationPanelOverlay />}
          <BallotHeader>
            <ContestTitleDiv>
              <CompactH2>{getContestDistrictName(election, contest)}</CompactH2>
              <CompactH1>{contest.title}</CompactH1>
            </ContestTitleDiv>
            <Button
              fill="outlined"
              icon="X"
              onPress={onClose}
              variant="inverseNeutral"
            >
              Close
            </Button>
          </BallotHeader>
          <BallotVoteCount>
            <MediumText>
              Votes cast:{' '}
              {isStateReady && (
                <React.Fragment>
                  {format.count(voteCount)} of {format.count(seatCount)}
                </React.Fragment>
              )}
            </MediumText>
            {isOvervote && (
              <Label>
                <Icons.Disabled color="danger" /> Overvote
              </Label>
            )}
            {isUndervote && (
              <Label>
                <Icons.Closed /> Undervote
              </Label>
            )}
          </BallotVoteCount>
          {!isStateReady ? (
            <ContestOptionButtonList style={{ justifyContent: 'center' }}>
              <Icons.Loading />
            </ContestOptionButtonList>
          ) : (
            <ContestOptionButtonList role="listbox">
              {officialOptions.map((officialOption) => {
                const { id: optionId } = officialOption;
                const originalVote = originalVotes.includes(optionId);
                const currentVote = getOptionHasVote(optionId);
                const optionLabel = isCandidateContest
                  ? (officialOption as Candidate).name
                  : (officialOption as YesNoOption).label;
                const marginalMarkStatus =
                  getOptionMarginalMarkStatus(optionId);
                return (
                  <ContestOptionButton
                    key={optionId + currentCvrId}
                    isSelected={currentVote}
                    marginalMarkStatus={marginalMarkStatus}
                    ref={
                      optionId === firstOptionIdPendingAdjudication
                        ? scrollTargetRef
                        : undefined
                    }
                    option={{
                      id: optionId,
                      label: optionLabel,
                    }}
                    onSelect={() => setOptionHasVote(optionId, true)}
                    onDeselect={() => setOptionHasVote(optionId, false)}
                    onDismissFlag={() => {
                      resolveOptionMarginalMark(optionId);
                    }}
                    disabled={
                      isBmd ||
                      // Disabled when there is a write-in selection for the candidate
                      (!currentVote &&
                        selectedCandidateNames.includes(optionLabel))
                    }
                    caption={renderContestOptionButtonCaption({
                      originalVote,
                      currentVote,
                      isWriteIn: false,
                      marginalMarkStatus,
                    })}
                  />
                );
              })}
              {writeInOptionIds.map((optionId) => {
                const originalVote = originalVotes.includes(optionId);
                const isSelected = getOptionHasVote(optionId);
                const isFocused = focusedOptionId === optionId;
                const writeInStatus = getOptionWriteInStatus(optionId);
                const writeInRecord = writeIns.find(
                  (writeIn) => writeIn.optionId === optionId
                );
                const marginalMarkStatus =
                  getOptionMarginalMarkStatus(optionId);
                return (
                  <WriteInAdjudicationButton
                    key={optionId + currentCvrId}
                    label={writeInRecord?.machineMarkedText}
                    writeInStatus={writeInStatus}
                    marginalMarkStatus={marginalMarkStatus}
                    isFocused={isFocused}
                    isSelected={isSelected}
                    hasInvalidEntry={doubleVoteAlert?.optionId === optionId}
                    // bmd ballots can only toggle-on write-ins that were
                    // previously detected, meaning the status would be defined
                    disabled={isBmd && writeInStatus === undefined}
                    onInputFocus={() => setFocusedOptionId(optionId)}
                    onInputBlur={() => setFocusedOptionId(undefined)}
                    ref={
                      optionId === firstOptionIdPendingAdjudication
                        ? scrollTargetRef
                        : undefined
                    }
                    onChange={(newStatus) => {
                      setFocusedOptionId(undefined);
                      if (isWriteInPending(newStatus)) {
                        setOptionWriteInStatus(optionId, newStatus);
                        setOptionHasVote(optionId, true);
                        return;
                      }
                      if (isWriteInInvalid(newStatus)) {
                        // If there was no write-in record, reset
                        // to undefined instead of invalid
                        setOptionWriteInStatus(
                          optionId,
                          writeInRecord ? newStatus : undefined
                        );
                        setOptionHasVote(optionId, false);
                        if (isMarginalMarkPending(marginalMarkStatus)) {
                          resolveOptionMarginalMark(optionId);
                        }
                        return;
                      }
                      const alert = checkWriteInNameForDoubleVote({
                        writeInName: newStatus.name,
                        optionId,
                      });
                      if (alert) {
                        setOptionWriteInStatus(optionId, { type: 'pending' });
                        setDoubleVoteAlert(alert);
                        return;
                      }
                      setOptionWriteInStatus(optionId, newStatus);
                      setOptionHasVote(optionId, true);
                      if (isMarginalMarkPending(marginalMarkStatus)) {
                        resolveOptionMarginalMark(optionId);
                      }
                    }}
                    officialCandidates={(officialOptions as Candidate[]).filter(
                      (c) =>
                        !selectedCandidateNames.includes(c.name) ||
                        (isValidCandidate(writeInStatus) &&
                          writeInStatus.name === c.name)
                    )}
                    writeInCandidates={writeInCandidates.filter(
                      (c) =>
                        !selectedCandidateNames.includes(c.name) ||
                        (isValidCandidate(writeInStatus) &&
                          writeInStatus.name === c.name)
                    )}
                    caption={renderContestOptionButtonCaption({
                      originalVote,
                      currentVote: isSelected,
                      isWriteIn: true,
                      writeInRecord,
                      writeInStatus,
                      marginalMarkStatus,
                    })}
                  />
                );
              })}
            </ContestOptionButtonList>
          )}
          <BallotFooter>
            <BallotMetadata>
              <SmallText>
                {format.count(cvrQueueIndex + 1)} of {format.count(numBallots)}{' '}
              </SmallText>
              <SmallText>Ballot ID: {currentCvrId.substring(0, 4)}</SmallText>
            </BallotMetadata>
            <BallotNavigation>
              <PrimaryNavButton
                disabled={
                  !allAdjudicationsCompleted ||
                  (!isModified && !allowSaveWithoutChanges)
                }
                icon="Done"
                onPress={saveAndNext}
                variant="primary"
              >
                {onLastBallot ? 'Finish' : 'Save & Next'}
              </PrimaryNavButton>
              <SecondaryNavButton
                onPress={onLastBallot ? onClose : onSkip}
                rightIcon="Next"
              >
                {onLastBallot ? 'Exit' : 'Skip'}
              </SecondaryNavButton>
              <SecondaryNavButton
                disabled={onFirstBallot}
                icon="Previous"
                onPress={onBack}
              >
                Back
              </SecondaryNavButton>
            </BallotNavigation>
          </BallotFooter>
        </AdjudicationPanel>
        {doubleVoteAlert && (
          <DoubleVoteAlertModal
            doubleVoteAlert={doubleVoteAlert}
            onClose={() => setDoubleVoteAlert(undefined)}
          />
        )}
        {discardChangesNextAction && (
          <DiscardChangesModal
            onBack={() => setDiscardChangesNextAction(undefined)}
            onDiscard={() => {
              switch (discardChangesNextAction) {
                case 'close':
                  onClose();
                  break;
                case 'back':
                  onBack();
                  break;
                case 'skip':
                  onSkip();
                  break;
                default: {
                  /* istanbul ignore next - @preserve */
                  throwIllegalValue(discardChangesNextAction);
                }
              }
              setDiscardChangesNextAction(undefined);
            }}
          />
        )}
      </Main>
    </Screen>
  );
}
