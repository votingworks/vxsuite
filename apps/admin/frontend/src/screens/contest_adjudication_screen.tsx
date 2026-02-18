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
  CandidateContestOption,
  ContestOptionId,
  getContestDistrictName,
  Id,
  Side,
} from '@votingworks/types';
import {
  Button,
  DesktopPalette,
  Main,
  Screen,
  Font,
  Icons,
  H2,
  H1,
  P,
} from '@votingworks/ui';
import { assert, assertDefined, find } from '@votingworks/basics';
import type {
  AdjudicatedContestOption,
  AdjudicatedCvrContest,
  BallotImages,
  ContestAdjudicationData,
  HmpbBallotPageImage,
  WriteInRecord,
} from '@votingworks/admin-backend';
import { format } from '@votingworks/utils';
import { getWriteInCandidates, adjudicateCvrContest } from '../api';
import { AppContext } from '../contexts/app_context';
import {
  BallotStaticImageViewer,
  BallotZoomImageViewer,
  UnableToLoadImageCallout,
} from '../components/adjudication_ballot_image_viewer';
import { WriteInAdjudicationButton } from '../components/write_in_adjudication_button';
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
  align-items: center;
  min-height: 4rem;
  flex-shrink: 0;

  button {
    flex-wrap: nowrap;
    font-weight: 600;
  }
`;

const BallotVoteCount = styled(BaseRow)`
  background: ${(p) => p.theme.colors.containerLow};
  border-bottom: ${(p) => p.theme.sizes.bordersRem.medium}rem solid
    ${DesktopPalette.Gray30};
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

const ContestOptionButtonList = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
  background: ${(p) => p.theme.colors.background};
  flex-grow: 1;
  padding: ${DEFAULT_PADDING};
  overflow-y: auto;
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

const Label = styled.span`
  color: ${(p) => p.theme.colors.inverseBackground};
  font-size: 1rem;
  font-weight: 500;
`;

const PrimaryNavButton = styled(Button)`
  flex-grow: 1;
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

interface ContestAdjudicationScreenProps {
  contestAdjudicationData: ContestAdjudicationData;
  cvrId: Id;
  onClose: () => void;
  ballotImages: BallotImages;
  side: Side;
}

export function ContestAdjudicationScreen({
  onClose,
  contestAdjudicationData,
  cvrId,
  ballotImages,
  side,
}: ContestAdjudicationScreenProps): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;

  const { options: contestOptions, contestId, tag } = contestAdjudicationData;
  const contest = find(election.contests, (c) => c.id === contestId);
  const isCandidateContest = contest.type === 'candidate';

  const writeInCandidatesQuery = getWriteInCandidates.useQuery({
    contestId,
  });

  const areQueriesFetching = writeInCandidatesQuery.isFetching;
  const adjudicateCvrContestMutation = adjudicateCvrContest.useMutation();

  const officialOptions = useMemo(() => {
    const optionDefinitions = contestOptions.map((o) => o.definition);
    if (!isCandidateContest) {
      return optionDefinitions;
    }
    return optionDefinitions.filter(
      (o) => !(o as CandidateContestOption).isWriteIn
    );
  }, [isCandidateContest, contestOptions]);

  const writeInOptionIds = useMemo(() => {
    if (!isCandidateContest) {
      return [];
    }
    // When contest is a CandidateContest, contestOptions are CandidateContestOptions
    return contestOptions
      .filter((o) => (o.definition as CandidateContestOption).isWriteIn)
      .map((o) => o.definition.id);
  }, [contestOptions, isCandidateContest]);

  const {
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
    areQueriesFetching
      ? undefined
      : {
          votes: contestOptions
            .filter((o) => o.initialVote)
            .map((o) => o.definition.id),
          writeIns: contestOptions
            .map((o) => o.writeInRecord)
            .filter((w) => !!w),
          writeInCandidates: writeInCandidatesQuery.data,
          voteAdjudications: contestOptions
            .map((o) => o.voteAdjudication)
            .filter((v) => !!v),
          marginalMarks: contestOptions
            .filter((o) => o.hasMarginalMark)
            .map((o) => o.definition.id),
          contestTag: contestAdjudicationData.tag,
        }
  );

  // Vote and write-in state for adjudication management
  const [focusedOptionId, setFocusedOptionId] = useState<string>();
  const [doubleVoteAlert, setDoubleVoteAlert] = useState<DoubleVoteAlert>();
  const [showDiscardChangesModal, setShowDiscardChangesModal] = useState(false);

  // Allow escape key to dismiss focused option or modal
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (focusedOptionId) {
          (document.activeElement as HTMLElement)?.blur();
          setFocusedOptionId(undefined);
        }
        setShowDiscardChangesModal(false);
        setDoubleVoteAlert(undefined);
      }
    }
    window.addEventListener('keydown', handleEscape, { capture: true });
    return () =>
      window.removeEventListener('keydown', handleEscape, { capture: true });
  }, [doubleVoteAlert, showDiscardChangesModal, focusedOptionId]);

  const scrollTargetRef = useRef<HTMLDivElement | null>(null);

  // Scroll to first pending adjudication option on load
  useLayoutEffect(() => {
    if (!areQueriesFetching && firstOptionIdPendingAdjudication) {
      scrollTargetRef.current?.scrollIntoView({
        behavior: 'instant',
        block: 'start',
      });
    }
  }, [areQueriesFetching, firstOptionIdPendingAdjudication]);

  const writeInCandidates = writeInCandidatesQuery.data;

  const seatCount = isCandidateContest ? contest.seats : 1;
  const isOvervote = isStateReady ? voteCount > seatCount : false;
  const isUndervote = isStateReady ? voteCount < seatCount : false;

  const allowSaveWithoutChanges =
    tag !== null &&
    (tag.hasOvervote || tag.hasUndervote) &&
    !tag.isResolved &&
    allAdjudicationsCompleted;

  const isHmpb = ballotImages.front.type === 'hmpb';
  const isBmd = ballotImages.front.type === 'bmd';
  const ballotImage = ballotImages[side];

  const focusedCoordinates =
    focusedOptionId && isHmpb
      ? getOptionCoordinates(
          assertDefined(
            (ballotImage as HmpbBallotPageImage).layout.contests.find(
              (c) => c.contestId === contestId
            )
          ).options,
          focusedOptionId
        )
      : undefined;

  async function onConfirm(): Promise<void> {
    const adjudicatedContestOptionById: Record<
      ContestOptionId,
      AdjudicatedContestOption
    > = {};
    const adjudicatedCvrContest: AdjudicatedCvrContest = {
      adjudicatedContestOptionById,
      contestId,
      cvrId,
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
      onClose();
    } catch {
      // Handled by default query client error handling
    }
  }

  function onExit(): void {
    if (isModified && !showDiscardChangesModal) {
      setShowDiscardChangesModal(true);
      return;
    }
    onClose();
  }

  return (
    <Screen>
      <Main flexRow data-testid={`transcribe:${cvrId}`}>
        <BallotPanel>
          {!ballotImage.imageUrl ? (
            <UnableToLoadImageCallout />
          ) : isHmpb ? (
            <BallotZoomImageViewer
              ballotBounds={ballotImage.ballotCoordinates}
              key={cvrId} // Reset zoom state for each write-in
              imageUrl={ballotImage.imageUrl}
              zoomedInBounds={
                focusedCoordinates ||
                assertDefined(
                  (ballotImage as HmpbBallotPageImage).layout.contests.find(
                    (c) => c.contestId === contestId
                  )
                ).bounds
              }
            />
          ) : isBmd ? (
            <BallotStaticImageViewer imageUrl={ballotImage.imageUrl} />
          ) : null}
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
              icon="ListUnordered"
              onPress={onExit}
              variant="inverseNeutral"
              style={{ padding: '0.3rem .75rem', fontSize: '.8rem' }}
            >
              Overview
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
          {!isStateReady || areQueriesFetching ? (
            <ContestOptionButtonList style={{ justifyContent: 'center' }}>
              <Icons.Loading />
            </ContestOptionButtonList>
          ) : (
            <ContestOptionButtonList role="listbox">
              {officialOptions.map((officialOption) => {
                const { id: optionId } = officialOption;
                const optionForAdjudication = assertDefined(
                  contestOptions.find((o) => o.definition.id === optionId)
                );
                const originalVote = optionForAdjudication.initialVote;
                const currentVote = getOptionHasVote(optionId);
                const optionLabel = isCandidateContest
                  ? (officialOption as Candidate).name
                  : officialOption.name;
                const marginalMarkStatus =
                  getOptionMarginalMarkStatus(optionId);
                return (
                  <ContestOptionButton
                    key={optionId + cvrId}
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
                const optionForAdjudication = assertDefined(
                  contestOptions.find((o) => o.definition.id === optionId)
                );
                const originalVote = optionForAdjudication.initialVote;
                const isSelected = getOptionHasVote(optionId);
                const isFocused = focusedOptionId === optionId;
                const writeInStatus = getOptionWriteInStatus(optionId);
                const { writeInRecord } = optionForAdjudication;
                const marginalMarkStatus =
                  getOptionMarginalMarkStatus(optionId);
                return (
                  <WriteInAdjudicationButton
                    key={optionId + cvrId}
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
                    writeInCandidates={assertDefined(writeInCandidates).filter(
                      (c) =>
                        !selectedCandidateNames.includes(c.name) ||
                        (isValidCandidate(writeInStatus) &&
                          writeInStatus.name === c.name)
                    )}
                    caption={renderContestOptionButtonCaption({
                      originalVote,
                      currentVote: isSelected,
                      isWriteIn: true,
                      writeInRecord: writeInRecord || undefined,
                      writeInStatus,
                      marginalMarkStatus,
                    })}
                  />
                );
              })}
            </ContestOptionButtonList>
          )}
          <BallotFooter>
            <PrimaryNavButton
              disabled={
                !allAdjudicationsCompleted ||
                (!isModified && !allowSaveWithoutChanges)
              }
              icon="Done"
              onPress={onConfirm}
              variant="primary"
            >
              Confirm
            </PrimaryNavButton>
          </BallotFooter>
        </AdjudicationPanel>
        {doubleVoteAlert && (
          <DoubleVoteAlertModal
            doubleVoteAlert={doubleVoteAlert}
            onClose={() => setDoubleVoteAlert(undefined)}
          />
        )}
        {showDiscardChangesModal && (
          <DiscardChangesModal
            onBack={() => setShowDiscardChangesModal(false)}
            onDiscard={() => {
              setShowDiscardChangesModal(false);
              onClose();
            }}
          />
        )}
      </Main>
    </Screen>
  );
}
