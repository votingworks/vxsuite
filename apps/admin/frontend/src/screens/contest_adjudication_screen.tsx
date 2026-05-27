import {
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
  PartyId,
  Side,
} from '@votingworks/types';
import { Button, Main, Screen, Font, Icons, H2, H1, P } from '@votingworks/ui';
import { assert, assertDefined, find } from '@votingworks/basics';
import type {
  AdjudicatedContestOptions,
  AdjudicatedCvrContest,
  BallotImages,
  ContestAdjudicationData,
  HmpbBallotPageImage,
  WriteInCandidateRecord,
  WriteInRecord,
} from '@votingworks/admin-backend';
import { format } from '@votingworks/utils';
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

const ContestHeader = styled(BaseRow)`
  background: ${(p) => p.theme.colors.inverseBackground};
  color: ${(p) => p.theme.colors.onInverse};
  flex-direction: column;
  align-items: flex-start;
  min-height: 4rem;
  flex-shrink: 0;
`;

const BallotVoteCount = styled(BaseRow)`
  background: ${(p) => p.theme.colors.container};
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  justify-content: space-between;
`;

const BallotFooter = styled(BaseRow)`
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

const DerivedVoteCaption = styled.span`
  color: ${(p) => p.theme.colors.onBackground};
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.2;
`;

const CaptionGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  margin: 0.25rem 0 0.25rem 0.125rem;

  ${ContestOptionButtonCaption} {
    margin: 0;
  }
`;

// Derived vote button: containerLow bg, primary text/icon, primary border.
// Alternative considered: primaryContainer bg, onBackground text/icon, outline border.
const DerivedVoteButton = styled(Button)`
  background-color: ${(p) => p.theme.colors.containerLow};
  border: 2px solid ${(p) => p.theme.colors.primary};
  color: ${(p) => p.theme.colors.primary};
  flex-wrap: nowrap;
  font-weight: ${(p) => p.theme.sizes.fontWeight.regular};
  justify-content: start;
  padding-left: 0.5rem;
  text-align: left;

  svg {
    color: ${(p) => p.theme.colors.primary};
  }
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

const NavButton = styled(Button)`
  flex: 1;
`;

function renderContestOptionButtonCaption({
  scannedVote,
  currentVote,
  isWriteIn,
  writeInStatus,
  writeInRecord,
  marginalMarkStatus,
}: {
  scannedVote: boolean;
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
    } else if (scannedVote && isWriteInInvalid(writeInStatus)) {
      originalValueStr = 'Write-In';
    }
  } else if (marginalMarkStatus === 'resolved') {
    originalValueStr = 'Marginal Mark';
  } else if (scannedVote !== currentVote) {
    originalValueStr = scannedVote ? 'Mark' : 'Undetected Mark';
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
  areWriteInCandidatesQualified: boolean;
  ballotImages: BallotImages;
  contestAdjudicationData: ContestAdjudicationData;
  cvrId: Id;
  onClose: () => void;
  onConfirmContest: (input: AdjudicatedCvrContest) => void;
  straightPartyId?: PartyId;
  side: Side;
  adjudicatedOptions?: AdjudicatedContestOptions;
  writeInCandidates: WriteInCandidateRecord[];
}

export function ContestAdjudicationScreen({
  areWriteInCandidatesQualified,
  ballotImages,
  contestAdjudicationData,
  cvrId,
  onClose,
  onConfirmContest,
  straightPartyId,
  side,
  adjudicatedOptions,
  writeInCandidates,
}: ContestAdjudicationScreenProps): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;

  const { options: contestOptions, contestId, tag } = contestAdjudicationData;
  const contest = find(election.contests, (c) => c.id === contestId);
  const isCandidateContest = contest.type === 'candidate';

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

  // In qualified-write-in mode, when this contest has no qualified candidates,
  // every pending write-in must be invalid: pre-mark them so the user only has
  // to address the contest's other adjudication reasons.
  function preMarkInvalidQualifiedWriteIns():
    | AdjudicatedContestOptions
    | undefined {
    if (adjudicatedOptions) {
      return adjudicatedOptions;
    }
    if (!areWriteInCandidatesQualified || writeInCandidates.length > 0) {
      return undefined;
    }
    const preMarked: AdjudicatedContestOptions = {};
    for (const option of contestAdjudicationData.options) {
      if (!option.writeInRecord) continue;
      preMarked[option.definition.id] = {
        type: 'write-in-option',
        hasVote: false,
      };
    }
    return Object.keys(preMarked).length > 0 ? preMarked : undefined;
  }

  const {
    isModified,
    getOptionHasVote,
    setOptionHasVote,
    getOptionWriteInStatus,
    setOptionWriteInStatus,
    getOptionMarginalMarkStatus,
    resolveOptionMarginalMark,
    getAdjudicatedContestOptions,
    checkWriteInNameForDoubleVote,
    allAdjudicationsCompleted,
    firstOptionIdPendingAdjudication,
    selectedCandidateNames,
    voteCount,
  } = useContestAdjudicationState({
    contestAdjudicationData,
    writeInCandidates,
    isCandidateContest,
    adjudicatedOptions: preMarkInvalidQualifiedWriteIns(),
  });

  // Compute derived options locally based on SP party and current vote state.
  // This replaces the backend-provided derivedOptionIds so that changes are
  // reflected immediately as the adjudicator toggles votes.
  const { derivedOptionIdSet, straightPartyNotAppliedReason } = useMemo(() => {
    if (!straightPartyId || !isCandidateContest) {
      return {
        derivedOptionIdSet: new Set<ContestOptionId>(),
        straightPartyNotAppliedReason: undefined,
      };
    }
    const partyOptionIds = contest.candidates
      .filter((c) => !c.isWriteIn && c.partyIds?.includes(straightPartyId))
      .map((c) => c.id);
    if (partyOptionIds.length === 0) {
      return {
        derivedOptionIdSet: new Set<ContestOptionId>(),
        straightPartyNotAppliedReason: undefined,
      };
    }
    const currentVoteIds = officialOptions
      .filter((o) => getOptionHasVote(o.id))
      .map((o) => o.id);
    const writeInVoteCount = writeInOptionIds.filter((id) =>
      getOptionHasVote(id)
    ).length;
    const totalVotes = currentVoteIds.length + writeInVoteCount;
    const remainingSeats = contest.seats - totalVotes;
    const unselectedPartyOptions = partyOptionIds.filter(
      (id) => !currentVoteIds.includes(id)
    );
    if (remainingSeats <= 0) {
      return {
        derivedOptionIdSet: new Set<ContestOptionId>(),
        straightPartyNotAppliedReason: 'No remaining seats' as const,
      };
    }
    if (unselectedPartyOptions.length > remainingSeats) {
      return {
        derivedOptionIdSet: new Set<ContestOptionId>(),
        straightPartyNotAppliedReason:
          'Too many candidates for remaining seats' as const,
      };
    }
    return {
      derivedOptionIdSet: new Set(unselectedPartyOptions),
      straightPartyNotAppliedReason: undefined,
    };
  }, [
    straightPartyId,
    isCandidateContest,
    contest,
    officialOptions,
    writeInOptionIds,
    getOptionHasVote,
  ]);

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
    if (firstOptionIdPendingAdjudication) {
      scrollTargetRef.current?.scrollIntoView({
        behavior: 'auto',
        block: 'start',
      });
    }
  }, [firstOptionIdPendingAdjudication]);

  const seatCount = isCandidateContest ? contest.seats : 1;
  const effectiveVoteCount = voteCount + derivedOptionIdSet.size;
  const isOvervote = effectiveVoteCount > seatCount;
  const isUndervote = effectiveVoteCount < seatCount;

  const allowSaveWithoutChanges =
    tag !== undefined &&
    (tag.hasOvervote || tag.hasUndervote) &&
    !adjudicatedOptions &&
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

  function onConfirm(): void {
    onConfirmContest({
      contestId,
      adjudicatedContestOptionById: getAdjudicatedContestOptions(),
    });
    onClose();
  }

  function onCancel(): void {
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
            <BallotStaticImageViewer
              imageUrl={ballotImage.imageUrl}
              ballotBounds={ballotImage.ballotCoordinates}
            />
          ) : null}
        </BallotPanel>
        <AdjudicationPanel>
          {focusedOptionId && <AdjudicationPanelOverlay />}
          <ContestHeader>
            <CompactH2>{getContestDistrictName(election, contest)}</CompactH2>
            <CompactH1>{contest.title}</CompactH1>
          </ContestHeader>
          <BallotVoteCount>
            <MediumText>
              Votes cast: {format.count(effectiveVoteCount)} of{' '}
              {format.count(seatCount)}
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
          <ContestOptionButtonList role="listbox">
            {officialOptions.map((officialOption) => {
              const { id: optionId } = officialOption;
              const { scannedVote } = assertDefined(
                contestOptions.find((o) => o.definition.id === optionId)
              );
              const currentVote = getOptionHasVote(optionId);
              const isDerived = derivedOptionIdSet.has(optionId);
              const candidate =
                isCandidateContest && contest.type === 'candidate'
                  ? contest.candidates.find((c) => c.id === optionId)
                  : undefined;
              const optionName = candidate?.name ?? officialOption.name;
              const candidatePartyNames = straightPartyId
                ? candidate?.partyIds
                    ?.map(
                      (pid) =>
                        election.parties.find((p) => p.id === pid)?.fullName
                    )
                    .filter(Boolean)
                    .join(', ')
                : undefined;
              const isStraightPartyCandidate =
                !!straightPartyId &&
                !!candidate?.partyIds?.includes(straightPartyId);
              const optionLabel = candidatePartyNames ? (
                <span>
                  {optionName}
                  <DerivedVoteCaption>
                    {candidatePartyNames}
                    {isStraightPartyCandidate && ' - Straight party vote'}
                  </DerivedVoteCaption>
                </span>
              ) : (
                optionName
              );
              const marginalMarkStatus = getOptionMarginalMarkStatus(optionId);
              const adjudicationCaption = renderContestOptionButtonCaption({
                scannedVote,
                currentVote,
                isWriteIn: false,
                marginalMarkStatus,
              });
              const spNotAppliedCaption =
                isStraightPartyCandidate &&
                !isDerived &&
                straightPartyNotAppliedReason ? (
                  <ContestOptionButtonCaption>
                    Straight party vote not applied:{' '}
                    {straightPartyNotAppliedReason}
                  </ContestOptionButtonCaption>
                ) : null;
              const combinedCaption =
                adjudicationCaption || spNotAppliedCaption ? (
                  <CaptionGroup>
                    {adjudicationCaption}
                    {spNotAppliedCaption}
                  </CaptionGroup>
                ) : undefined;

              if (isDerived && !currentVote) {
                return (
                  <div
                    key={optionId + cvrId}
                    style={{ display: 'flex', flexDirection: 'column' }}
                  >
                    <DerivedVoteButton
                      role="checkbox"
                      aria-checked
                      fill="outlined"
                      color="neutral"
                      onPress={() => setOptionHasVote(optionId, true)}
                      icon={<Icons.Checkbox filled={false} />}
                    >
                      {optionLabel}
                    </DerivedVoteButton>
                    {combinedCaption}
                  </div>
                );
              }

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
                      selectedCandidateNames.includes(optionName))
                  }
                  caption={combinedCaption}
                />
              );
            })}
            {writeInOptionIds.map((optionId) => {
              const { scannedVote, writeInRecord } = assertDefined(
                contestOptions.find((o) => o.definition.id === optionId)
              );
              const isSelected = getOptionHasVote(optionId);
              const isFocused = focusedOptionId === optionId;
              const writeInStatus = getOptionWriteInStatus(optionId);
              const marginalMarkStatus = getOptionMarginalMarkStatus(optionId);
              return (
                <WriteInAdjudicationButton
                  key={optionId + cvrId}
                  areWriteInCandidatesQualified={areWriteInCandidatesQualified}
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
                    if (isWriteInInvalid(newStatus) && !writeInRecord) {
                      // No record to override, so revert to the no-vote default
                      // (clearing the entry keeps isModified accurate).
                      setOptionWriteInStatus(optionId, undefined);
                      return;
                    }
                    if (isValidCandidate(newStatus)) {
                      const alert = checkWriteInNameForDoubleVote({
                        writeInName: newStatus.name,
                        optionId,
                      });
                      if (alert) {
                        setOptionWriteInStatus(optionId, { type: 'pending' });
                        setDoubleVoteAlert(alert);
                        return;
                      }
                    }
                    setOptionWriteInStatus(optionId, newStatus);
                  }}
                  officialCandidates={
                    areWriteInCandidatesQualified
                      ? []
                      : (officialOptions as Candidate[]).filter(
                          (c) =>
                            !selectedCandidateNames.includes(c.name) ||
                            (isValidCandidate(writeInStatus) &&
                              writeInStatus.name === c.name)
                        )
                  }
                  writeInCandidates={writeInCandidates.filter(
                    (c) =>
                      !selectedCandidateNames.includes(c.name) ||
                      (isValidCandidate(writeInStatus) &&
                        writeInStatus.name === c.name)
                  )}
                  caption={renderContestOptionButtonCaption({
                    scannedVote,
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
          <BallotFooter>
            <NavButton onPress={onCancel} variant="neutral">
              Cancel
            </NavButton>
            <NavButton
              disabled={
                !allAdjudicationsCompleted ||
                (!isModified && !allowSaveWithoutChanges)
              }
              icon="Done"
              onPress={onConfirm}
              variant="primary"
            >
              Confirm
            </NavButton>
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
