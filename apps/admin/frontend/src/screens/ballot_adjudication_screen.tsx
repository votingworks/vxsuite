import React, { useContext, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { Button, Loading, Main, Modal, P, Screen } from '@votingworks/ui';
import {
  AdjudicationReason,
  ContestId,
  ContestOptionId,
  Election,
  Id,
  Side,
  SystemSettings,
} from '@votingworks/types';
import { format } from '@votingworks/utils';
import type {
  AdjudicatedContestOption,
  AdjudicatedCvrContest,
  AdjudicationError,
  BallotAdjudicationData,
  BallotImages,
  ContestAdjudicationData,
  WriteInCandidateRecord,
} from '@votingworks/admin-backend';
import { useHistory } from 'react-router-dom';
import { assert, assertDefined, deepEqual, find } from '@votingworks/basics';
import {
  adjudicateCvr,
  claimAndLoadBallot,
  getBallotAdjudicationQueue,
  getBallotImages,
  getNextCvrIdForBallotAdjudication,
  getSystemSettings,
  getWriteInCandidates,
  releaseBallotAdjudicationClaim,
  useApiClient,
} from '../api';
import { routerPaths } from '../router_paths';
import {
  BallotStaticImageViewer,
  UnableToLoadImageCallout,
} from '../components/adjudication_ballot_image_viewer';
import {
  AdjudicationContestList,
  ContestListItem,
} from '../components/adjudication_contest_list';
import { AppContext } from '../contexts/app_context';
import { ContestAdjudicationScreen } from './contest_adjudication_screen';
import {
  isContestResolved,
  isContestTagOnlyUndervote,
} from '../utils/adjudication';
import { DiscardChangesModal } from '../components/discard_changes_modal';

const ADJUDICATION_PANEL_WIDTH = '23.5rem';
const DEFAULT_PADDING = '0.75rem';

const BallotPanel = styled.div`
  background: black;
  flex: 1;
  position: relative;
`;

const SmallText = styled(P)`
  color: ${(p) => p.theme.colors.onBackgroundMuted};
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1;
  margin: 0;
`;

const AdjudicationPanel = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: ${ADJUDICATION_PANEL_WIDTH};
  border-left: 4px solid black;
`;

const PanelHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${DEFAULT_PADDING};
  background: ${(p) => p.theme.colors.inverseBackground};
  color: ${(p) => p.theme.colors.onInverse};
  flex-shrink: 0;
`;

const BallotInfo = styled.div`
  display: flex;
  flex-direction: column;
`;

const BallotInfoText = styled.p`
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1;
  margin: 0;
`;

const PanelFooter = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: ${DEFAULT_PADDING};
  background: ${(p) => p.theme.colors.container};
  border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  flex-shrink: 0;
`;

const FooterNav = styled.div`
  display: flex;
  flex-direction: row-reverse;
  gap: 0.5rem;
`;

const PrimaryNavButton = styled(Button)`
  flex-grow: 1;
`;

const SecondaryNavButton = styled(Button)`
  width: 5.5rem;
`;

const ModalActions = styled.div`
  display: flex;
  gap: 0.5rem;

  button {
    flex: 1 1 0;
  }
`;

const ClaimedBallotOverlay = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  color: ${(p) => p.theme.colors.onBackground};
  opacity: 0.8;
`;

function groupContestsBySide(
  ballotImages: BallotImages,
  contestAdjudicationData: ContestAdjudicationData[],
  election: Election
): { frontContests: ContestListItem[]; backContests: ContestListItem[] } {
  const contestsById = new Map(election.contests.map((c) => [c.id, c]));
  const items: ContestListItem[] = contestAdjudicationData.map((data) => ({
    contest: assertDefined(contestsById.get(data.contestId)),
    adjudicationData: data,
  }));
  const { front, back } = ballotImages;
  if (front.type === 'bmd') {
    return { frontContests: items, backContests: [] };
  }
  assert(back.type === 'hmpb');
  const frontContestIds = new Set(
    front.layout.contests.map((c) => c.contestId)
  );
  const frontContests: ContestListItem[] = [];
  const backContests: ContestListItem[] = [];
  for (const item of items) {
    if (frontContestIds.has(item.contest.id)) {
      frontContests.push(item);
    } else {
      backContests.push(item);
    }
  }
  return { frontContests, backContests };
}

export function BallotAdjudicationScreenWrapper(): JSX.Element {
  const ballotQueueQuery = getBallotAdjudicationQueue.useQuery();
  const nextCvrIdQuery = getNextCvrIdForBallotAdjudication.useQuery();

  if (!ballotQueueQuery.isSuccess || !nextCvrIdQuery.isSuccess) {
    return (
      <Screen>
        <Main flexRow>
          <Loading isFullscreen />
        </Main>
      </Screen>
    );
  }

  const queue = ballotQueueQuery.data;
  const nextCvrId = nextCvrIdQuery.data;
  const initialQueueIndex = nextCvrId
    ? Math.max(0, queue.indexOf(nextCvrId))
    : 0;

  return (
    <HostBallotAdjudicationScreen
      queue={queue}
      initialQueueIndex={initialQueueIndex}
    />
  );
}

function HostBallotAdjudicationScreen({
  queue,
  initialQueueIndex,
}: {
  queue: Id[];
  initialQueueIndex: number;
}): JSX.Element {
  const history = useHistory();
  const [queueIndex, setQueueIndex] = useState(initialQueueIndex);
  const [claimError, setClaimError] = useState<AdjudicationError | null>(null);
  const [isClaimInFlight, setIsClaimInFlight] = useState(true);
  const [ballotData, setBallotData] = useState<BallotAdjudicationData | null>(
    null
  );
  const currentCvrId = queue[queueIndex];
  const apiClient = useApiClient();
  const { mutateAsync: claimAndLoadMutation } =
    claimAndLoadBallot.useMutation();
  const { mutateAsync: releaseClaimMutation } =
    releaseBallotAdjudicationClaim.useMutation();
  const claimedCvrIdRef = useRef<Id | null>(null);

  // Release the previous claim (if any) and then claim+load the
  // next ballot in a single round trip. Returns whether the claim succeeded
  // and updates ballot data state on success. The previous ballot stays
  // visible until the new data lands (we set ballotData only after success).
  async function claimAndRelease(nextCvrId?: Id): Promise<boolean> {
    const prevCvrId = claimedCvrIdRef.current;
    if (prevCvrId && prevCvrId !== nextCvrId) {
      claimedCvrIdRef.current = null;
      try {
        await releaseClaimMutation({ cvrId: prevCvrId });
      } catch {
        // Best-effort release
      }
    }
    if (!nextCvrId) {
      return true;
    }
    try {
      const result = await claimAndLoadMutation({ cvrId: nextCvrId });
      if (result.isErr()) {
        const error = result.err();
        if (error.type === 'claim-failed') {
          // Another station owns this ballot. Hand the renderer an empty
          // placeholder so the claimed-by-another overlay draws cleanly,
          // without carrying over the previous ballot's contests/derived
          // state.
          setBallotData({
            cvrId: nextCvrId,
            contests: [],
            tag: { isBlankBallot: false },
            isResolved: false,
            adjudicatedContests: [],
          });
        } else {
          // Non-recoverable error (e.g. host disconnect). Clear ballot data
          // so the parent routes to the "Unable to load ballot" screen.
          setBallotData(null);
        }
        setClaimError(error);
        return false;
      }
      const value = result.ok();
      if (value) {
        claimedCvrIdRef.current = value.cvrId;
        setBallotData(value.data);
        setClaimError(null);
        return true;
      }
      // Host returned ok(undefined) — no ballot. Treat as a failed claim
      // so the caller can navigate away.
      return false;
    } catch {
      return false;
    }
  }

  // Claim+load the initial ballot on mount, release on unmount
  useEffect(() => {
    if (currentCvrId) {
      claimAndRelease(currentCvrId)
        .catch(() => setClaimError({ type: 'claim-failed' }))
        .finally(() => setIsClaimInFlight(false));
    } else {
      setIsClaimInFlight(false);
    }
    return () => {
      claimAndRelease().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* istanbul ignore next - empty queue redirect @preserve */
  if (!currentCvrId) {
    history.push(routerPaths.adjudication);
    return (
      <Screen>
        <Main flexRow>
          <Loading isFullscreen />
        </Main>
      </Screen>
    );
  }

  async function navigateTo(nextIndex: number): Promise<void> {
    setIsClaimInFlight(true);
    try {
      const nextId = queue[nextIndex];
      await claimAndRelease(nextId);
      setQueueIndex(nextIndex);
    } finally {
      setIsClaimInFlight(false);
    }
  }

  const isLastInQueue = queueIndex >= queue.length - 1;

  // Skip moves forward by exactly one position in the queue, regardless of
  // whether the next ballot is claimed by another machine.
  async function navigateSkip(): Promise<void> {
    setIsClaimInFlight(true);
    try {
      if (isLastInQueue) {
        await claimAndRelease();
        history.push(routerPaths.adjudication);
        return;
      }
      await navigateTo(queueIndex + 1);
    } finally {
      setIsClaimInFlight(false);
    }
  }

  async function navigateAcceptNext(): Promise<void> {
    setIsClaimInFlight(true);
    try {
      const nextCvrId = await apiClient.getNextCvrIdForBallotAdjudication({
        afterCvrId: currentCvrId,
      });
      const nextIndex = nextCvrId ? queue.indexOf(nextCvrId) : -1;
      if (nextIndex < 0) {
        // No ballot left, or the next one isn't in our cached queue drop back to the landing screen
        await claimAndRelease();
        history.push(routerPaths.adjudication);
        return;
      }
      await navigateTo(nextIndex);
    } finally {
      setIsClaimInFlight(false);
    }
  }

  async function navigateExit(): Promise<void> {
    setIsClaimInFlight(true);
    try {
      await claimAndRelease();
      history.push(routerPaths.adjudication);
    } finally {
      setIsClaimInFlight(false);
    }
  }

  // The current ballot is held by another machine when our atomic claim+load
  // came back `claim-failed`. The host always claims before displaying, so this
  // mutation result is the authoritative claim status for the shown ballot.
  const isClaimed = claimError?.type === 'claim-failed';
  const statusText = `Ballot ${format.count(queueIndex + 1)} of ${format.count(
    queue.length
  )}`;

  return (
    <HostBallotAdjudicationScreenDataLoader
      cvrId={currentCvrId}
      ballotData={ballotData}
      statusText={statusText}
      isClaimed={isClaimed}
      isClaimInFlight={isClaimInFlight}
      isLastBallot={isLastInQueue}
      onAcceptDone={navigateAcceptNext}
      onSkip={navigateSkip}
      onBack={queueIndex > 0 ? () => navigateTo(queueIndex - 1) : undefined}
      onExit={navigateExit}
    />
  );
}

function HostBallotAdjudicationScreenDataLoader({
  cvrId,
  ballotData,
  onExit,
  isClaimInFlight,
  isClaimed,
  ...rest
}: {
  cvrId: Id;
  ballotData: BallotAdjudicationData | null;
  statusText: string;
  isClaimed: boolean;
  isClaimInFlight: boolean;
  isLastBallot: boolean;
  onAcceptDone: () => void;
  onSkip: () => void;
  onBack?: () => void;
  onExit: () => void;
}): JSX.Element {
  const ballotImagesQuery = getBallotImages.useQuery({ cvrId });
  const writeInCandidatesQuery = getWriteInCandidates.useQuery();
  const systemSettingsQuery = getSystemSettings.useQuery();

  const { mutateAsync: adjudicateCvrMutation } = adjudicateCvr.useMutation();
  const [saveError, setSaveError] = useState(false);

  if (saveError) {
    return (
      <Screen>
        <Main centerChild>
          <P>Error saving adjudication. Please try again.</P>
          <Button onPress={onExit}>Exit</Button>
        </Main>
      </Screen>
    );
  }

  // Claiming has settled (no longer in flight) but produced neither this
  // machine's ballot data nor a claimed-by-another overlay — i.e. the
  // claim+load request failed. Surface an error with a way out instead of
  // spinning on Loading forever.
  if (!isClaimInFlight && !isClaimed && !ballotData) {
    return (
      <Screen>
        <Main centerChild>
          <P>Unable to load ballot. Please try again.</P>
          <Button onPress={onExit}>Exit</Button>
        </Main>
      </Screen>
    );
  }

  // Still resolving: the initial claim is in flight, or the auxiliary queries
  // (images / write-ins / settings) haven't landed yet.
  if (
    !ballotImagesQuery.isSuccess ||
    !writeInCandidatesQuery.isSuccess ||
    !systemSettingsQuery.isSuccess ||
    (!isClaimed && !ballotData)
  ) {
    return (
      <Screen>
        <Main flexRow>
          <Loading isFullscreen />
        </Main>
      </Screen>
    );
  }

  const adjudicationData = assertDefined(ballotData);

  return (
    <BallotAdjudicationScreen
      // Use the query's cvrId as key/prop so the screen unmounts/remounts
      // with the new data coming in. With the prop as the key, the component
      // unmounts when the key changes, but the ballot data hasn't yet loaded,
      // so there is a render where the cvrId shown on the screen to the user
      // doesn't match the ballot data (since we use keepPreviousData=true on
      // the query to avoid the Loading screen from flickering in between each ballot)
      key={cvrId}
      cvrId={cvrId}
      ballotAdjudicationData={adjudicationData}
      ballotImages={ballotImagesQuery.data}
      writeInCandidates={writeInCandidatesQuery.data}
      systemSettings={systemSettingsQuery.data}
      isClaimed={isClaimed}
      isClaimInFlight={isClaimInFlight}
      onAccept={async (input) => {
        const result = await adjudicateCvrMutation(input);
        if (result.isErr()) setSaveError(true);
      }}
      onExit={onExit}
      {...rest}
    />
  );
}

export interface BallotAdjudicationScreenProps {
  cvrId: Id;
  ballotAdjudicationData: BallotAdjudicationData;
  ballotImages: BallotImages;
  writeInCandidates: WriteInCandidateRecord[];
  systemSettings: SystemSettings;
  statusText?: string;
  isClaimed?: boolean;
  isClaimInFlight?: boolean;
  isLastBallot?: boolean;
  onAccept: (input: {
    cvrId: Id;
    contests: AdjudicatedCvrContest[];
  }) => Promise<void>;
  onAcceptDone: () => void;
  onSkip?: () => void;
  onBack?: () => void;
  onExit: () => void;
}

export function BallotAdjudicationScreen({
  cvrId,
  ballotAdjudicationData,
  ballotImages,
  writeInCandidates,
  systemSettings,
  statusText,
  isClaimed,
  isClaimInFlight,
  isLastBallot,
  onAccept,
  onAcceptDone,
  onSkip,
  onBack,
  onExit,
}: BallotAdjudicationScreenProps): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  const election = assertDefined(electionDefinition?.election);

  const contestAdjudicationData = ballotAdjudicationData.contests;
  const { frontContests, backContests } = groupContestsBySide(
    ballotImages,
    contestAdjudicationData,
    election
  );

  function getDefaultSide(
    adjudicatedContests: ReadonlyMap<ContestId, AdjudicatedCvrContest>
  ): Side {
    const backIds = new Set(backContests.map((item) => item.contest.id));
    const firstPending = contestAdjudicationData
      .filter((c) => c.tag !== null)
      .find((c) => !isContestResolved(c, adjudicatedContests));
    return firstPending && backIds.has(firstPending.contestId)
      ? 'back'
      : 'front';
  }

  const [selectedContestId, setSelectedContestId] = useState<ContestId | null>(
    null
  );
  const [hoveredContestId, setHoveredContestId] = useState<ContestId | null>(
    null
  );
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingDiscard, setPendingDiscard] = useState<{
    action: () => void;
  } | null>(null);

  // Derives the baseline adjudication state from persisted adjudications.
  // In qualified-write-in mode, auto-resolve contests whose only adjudication
  // reason is write-ins when the contest has no qualified candidates: every
  // write-in must be invalid, so the user has nothing to decide.
  function adjudicatedContestsBaseline(): Map<
    ContestId,
    AdjudicatedCvrContest
  > {
    const baseline = new Map<ContestId, AdjudicatedCvrContest>(
      ballotAdjudicationData.adjudicatedContests.map((c) => [c.contestId, c])
    );
    if (
      !systemSettings.areWriteInCandidatesQualified ||
      ballotAdjudicationData.isResolved
    ) {
      return baseline;
    }
    const contestIdsWithQualified = new Set(
      writeInCandidates.map((c) => c.contestId)
    );

    for (const { adjudicationData: contest } of [
      ...frontContests,
      ...backContests,
    ]) {
      if (baseline.has(contest.contestId)) continue;
      const { tag } = contest;
      if (!tag) continue;
      const hasWriteInFlag = tag.hasWriteIn || tag.hasUnmarkedWriteIn;
      const hasOtherFlag =
        tag.hasOvervote || tag.hasUndervote || tag.hasMarginalMark;
      if (!hasWriteInFlag || hasOtherFlag) continue;
      if (contestIdsWithQualified.has(contest.contestId)) continue;

      const adjudicatedContestOptionById: Record<
        ContestOptionId,
        AdjudicatedContestOption
      > = {};
      for (const option of contest.options) {
        const isWriteIn =
          option.definition.type === 'candidate' && option.definition.isWriteIn;
        adjudicatedContestOptionById[option.definition.id] = isWriteIn
          ? { type: 'write-in-option', hasVote: false }
          : { type: 'official-option', hasVote: option.scannedVote };
      }
      baseline.set(contest.contestId, {
        contestId: contest.contestId,
        adjudicatedContestOptionById,
      });
    }
    return baseline;
  }

  const [adjudicatedContests, setAdjudicatedContests] = useState<
    Map<ContestId, AdjudicatedCvrContest>
  >(adjudicatedContestsBaseline);

  const [selectedSide, setSelectedSide] = useState<Side>(() =>
    getDefaultSide(adjudicatedContests)
  );

  function onNavigation(action: () => void): () => void {
    return () => {
      if (!deepEqual(adjudicatedContests, adjudicatedContestsBaseline())) {
        setPendingDiscard({ action });
      } else {
        action();
      }
    };
  }
  const onSkipGuarded = onSkip && onNavigation(onSkip);
  const onBackGuarded = onBack && onNavigation(onBack);
  const onExitGuarded = onNavigation(onExit);

  const cvrTag = ballotAdjudicationData.tag;
  const { front, back } = ballotImages;
  const visibleImage = selectedSide === 'front' ? front : back;

  const showUndervoteStatus = systemSettings.adminAdjudicationReasons.includes(
    AdjudicationReason.Undervote
  );

  const allResolved =
    contestAdjudicationData.every((c) =>
      isContestResolved(c, adjudicatedContests)
    ) ||
    (cvrTag?.isBlankBallot &&
      contestAdjudicationData.every(
        (c) =>
          isContestResolved(c, adjudicatedContests) ||
          (c.tag && isContestTagOnlyUndervote(c.tag))
      ));

  const hasUnresolvedWriteIns = contestAdjudicationData.some(
    (c) =>
      c.tag &&
      !isContestResolved(c, adjudicatedContests) &&
      (c.tag.hasWriteIn || c.tag.hasUnmarkedWriteIn)
  );

  function onAcceptAndNext(): void {
    if (!allResolved) {
      setShowConfirmModal(true);
      return;
    }
    void confirmAcceptAndNext();
  }

  async function confirmAcceptAndNext(): Promise<void> {
    setShowConfirmModal(false);
    try {
      await onAccept({
        cvrId,
        contests: [...adjudicatedContests.values()],
      });
      onAcceptDone();
    } catch {
      // Handled by caller
    }
  }

  function onCloseContest(): void {
    setSelectedContestId(null);
    setHoveredContestId(null);
  }

  function onContestHover(contestId: ContestId | null): void {
    setHoveredContestId(contestId);
  }

  const hoveredContestBounds = (() => {
    if (hoveredContestId && visibleImage.type === 'hmpb') {
      return visibleImage.layout.contests.find(
        (c) => c.contestId === hoveredContestId
      )?.bounds;
    }
    return undefined;
  })();

  const hoveredContestHasWarning = (() => {
    if (!hoveredContestId) return false;
    const item = find(
      [...frontContests, ...backContests],
      (i) => i.contest.id === hoveredContestId
    );
    return !isContestResolved(item.adjudicationData, adjudicatedContests);
  })();

  if (selectedContestId && !isClaimed) {
    return (
      <ContestAdjudicationScreen
        areWriteInCandidatesQualified={
          systemSettings.areWriteInCandidatesQualified ?? false
        }
        cvrId={cvrId}
        side={
          frontContests.some((item) => item.contest.id === selectedContestId)
            ? 'front'
            : 'back'
        }
        onClose={onCloseContest}
        contestAdjudicationData={find(
          contestAdjudicationData,
          (c) => c.contestId === selectedContestId
        )}
        adjudicatedOptions={
          adjudicatedContests.get(selectedContestId)
            ?.adjudicatedContestOptionById
        }
        ballotImages={ballotImages}
        writeInCandidates={writeInCandidates.filter(
          (c) => c.contestId === selectedContestId
        )}
        onConfirmContest={(input) => {
          const updated = new Map(adjudicatedContests).set(
            input.contestId,
            input
          );
          setAdjudicatedContests(updated);
          setSelectedSide(getDefaultSide(updated));
        }}
      />
    );
  }

  return (
    <Screen>
      <Main flexRow>
        <BallotPanel>
          {!visibleImage.imageUrl ? (
            <UnableToLoadImageCallout />
          ) : (
            <BallotStaticImageViewer
              ballotBounds={visibleImage.ballotCoordinates}
              highlight={
                hoveredContestBounds && {
                  bounds: hoveredContestBounds,
                  variant: hoveredContestHasWarning ? 'warning' : 'primary',
                }
              }
              imageUrl={visibleImage.imageUrl}
            />
          )}
        </BallotPanel>
        <AdjudicationPanel>
          <PanelHeader>
            <BallotInfo>
              <BallotInfoText>
                Ballot ID: {cvrId.substring(0, 4)}
              </BallotInfoText>
            </BallotInfo>
            <Button
              fill="outlined"
              color="inverseNeutral"
              icon="X"
              onPress={onExitGuarded}
              style={{ padding: '0.3rem .75rem', fontSize: '.8rem' }}
            >
              Exit
            </Button>
          </PanelHeader>
          {isClaimed ? (
            <ClaimedBallotOverlay>
              <P>
                This ballot is currently being adjudicated by another machine.
              </P>
            </ClaimedBallotOverlay>
          ) : (
            <AdjudicationContestList
              key={cvrId}
              adjudicatedContests={adjudicatedContests}
              backContests={backContests}
              cvrTag={cvrTag}
              election={election}
              frontContests={frontContests}
              isResolved={ballotAdjudicationData.isResolved}
              onHover={onContestHover}
              onSelect={(contestId) => setSelectedContestId(contestId)}
              onSelectSide={setSelectedSide}
              selectedSide={selectedSide}
              showUndervoteStatus={showUndervoteStatus}
            />
          )}
          <PanelFooter>
            {statusText && <SmallText>{statusText}</SmallText>}
            <FooterNav>
              {isClaimed ? (
                <React.Fragment>
                  {onSkipGuarded && (
                    <PrimaryNavButton
                      onPress={onSkipGuarded}
                      disabled={isClaimInFlight}
                      rightIcon={isLastBallot ? 'Done' : 'Next'}
                      variant="primary"
                    >
                      {isLastBallot ? 'Done' : 'Next'}
                    </PrimaryNavButton>
                  )}
                  {onBackGuarded && (
                    <SecondaryNavButton
                      icon="Previous"
                      onPress={onBackGuarded}
                      disabled={isClaimInFlight}
                    >
                      Back
                    </SecondaryNavButton>
                  )}
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <PrimaryNavButton
                    icon="Done"
                    onPress={onAcceptAndNext}
                    disabled={hasUnresolvedWriteIns || isClaimInFlight}
                    variant={allResolved ? 'primary' : 'neutral'}
                  >
                    Accept
                  </PrimaryNavButton>
                  {onSkipGuarded && (
                    <SecondaryNavButton
                      onPress={onSkipGuarded}
                      rightIcon="Next"
                      disabled={isClaimInFlight}
                    >
                      Skip
                    </SecondaryNavButton>
                  )}
                  {onBackGuarded && (
                    <SecondaryNavButton
                      icon="Previous"
                      onPress={onBackGuarded}
                      disabled={isClaimInFlight}
                    >
                      Back
                    </SecondaryNavButton>
                  )}
                </React.Fragment>
              )}
            </FooterNav>
          </PanelFooter>
        </AdjudicationPanel>
      </Main>
      {showConfirmModal && (
        <Modal
          title="Incomplete Adjudication"
          content="Not all contests on this ballot have been adjudicated. Are you sure you want to accept and continue?"
          actions={
            <ModalActions>
              <Button
                variant="neutral"
                onPress={() => setShowConfirmModal(false)}
              >
                Back
              </Button>
              <Button variant="danger" onPress={confirmAcceptAndNext}>
                Accept Anyway
              </Button>
            </ModalActions>
          }
        />
      )}
      {pendingDiscard && (
        <DiscardChangesModal
          onBack={() => setPendingDiscard(null)}
          onDiscard={() => {
            const { action } = pendingDiscard;
            setPendingDiscard(null);
            action();
          }}
        />
      )}
    </Screen>
  );
}
