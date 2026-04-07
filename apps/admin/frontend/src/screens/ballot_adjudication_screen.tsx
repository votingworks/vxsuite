import React, { useContext, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import type {
  AdjudicatedCvrContest,
  BallotAdjudicationData,
  BallotImages,
  ContestAdjudicationData,
  CvrContestTag,
  WriteInCandidateRecord,
} from '@votingworks/admin-backend';
import { assert, assertDefined, find } from '@votingworks/basics';
import {
  AdjudicationReason,
  ContestId,
  Election,
  Id,
  Side,
  SystemSettings,
} from '@votingworks/types';
import { Button, Loading, Main, Modal, P, Screen } from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { useHistory } from 'react-router-dom';
import {
  adjudicateCvrContest,
  claimBallotForAdjudication,
  getBallotAdjudicationData as getBallotAdjudicationDataQuery,
  getBallotAdjudicationQueue,
  getBallotImages as getBallotImagesQuery,
  getClaimedBallotCvrIds,
  getIsClientAdjudicationEnabled,
  getNextCvrIdForBallotAdjudication,
  getSystemSettings as getSystemSettingsQuery,
  getWriteInCandidates as getWriteInCandidatesQuery,
  releaseBallotAdjudicationClaim,
  resolveBallotTags,
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

function isContestTagOnlyUndervote(tag: CvrContestTag) {
  return (
    tag.hasUndervote &&
    !tag.hasMarginalMark &&
    !tag.hasWriteIn &&
    !tag.hasUnmarkedWriteIn &&
    !tag.hasOvervote
  );
}

export function BallotAdjudicationScreenWrapper(): JSX.Element {
  const ballotQueueQuery = getBallotAdjudicationQueue.useQuery();
  const nextCvrIdQuery = getNextCvrIdForBallotAdjudication.useQuery();
  const multiStationQuery = getIsClientAdjudicationEnabled.useQuery();
  const isMultiStation = multiStationQuery.data;
  const claimedCvrIdsQuery = getClaimedBallotCvrIds.useQuery();

  if (
    !ballotQueueQuery.isSuccess ||
    !nextCvrIdQuery.isSuccess ||
    !claimedCvrIdsQuery.isSuccess
  ) {
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
  const claimedCvrIds = isMultiStation
    ? new Set(claimedCvrIdsQuery.data)
    : new Set<Id>();
  const initialQueueIndex = nextCvrId
    ? Math.max(0, queue.indexOf(nextCvrId))
    : 0;

  return (
    <HostBallotAdjudicationScreen
      queue={queue}
      initialQueueIndex={initialQueueIndex}
      claimedCvrIds={claimedCvrIds}
      isMultiStation={Boolean(isMultiStation)}
    />
  );
}

function HostBallotAdjudicationScreen({
  queue,
  initialQueueIndex,
  claimedCvrIds,
  isMultiStation,
}: {
  queue: Id[];
  initialQueueIndex: number;
  claimedCvrIds: Set<Id>;
  isMultiStation: boolean;
}): JSX.Element {
  const history = useHistory();
  const [queueIndex, setQueueIndex] = useState(initialQueueIndex);
  const currentCvrId = queue[queueIndex];
  const { mutateAsync: claimBallotMutation } =
    claimBallotForAdjudication.useMutation();
  const { mutateAsync: releaseClaimMutation } =
    releaseBallotAdjudicationClaim.useMutation();
  const claimedCvrIdRef = useRef<Id | null>(null);

  async function claimAndRelease(nextCvrId?: Id): Promise<void> {
    if (!isMultiStation) return;
    const prevCvrId = claimedCvrIdRef.current;
    if (prevCvrId) {
      claimedCvrIdRef.current = null;
      try {
        await releaseClaimMutation({ cvrId: prevCvrId });
      } catch {
        // Best-effort release
      }
    }
    if (nextCvrId && !claimedCvrIds.has(nextCvrId)) {
      try {
        await claimBallotMutation({ cvrId: nextCvrId });
        claimedCvrIdRef.current = nextCvrId;
      } catch {
        // Best-effort claim
      }
    }
  }

  // Claim the initial ballot on mount
  useEffect(() => {
    if (currentCvrId) {
      void claimAndRelease(currentCvrId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function navigateTo(nextIndex: number): void {
    const nextCvrId = queue[nextIndex];
    void claimAndRelease(nextCvrId);
    setQueueIndex(nextIndex);
  }

  function navigateNext(): void {
    if (queueIndex >= queue.length - 1) {
      void claimAndRelease();
      history.push(routerPaths.adjudication);
    } else {
      navigateTo(queueIndex + 1);
    }
  }

  function navigateExit(): void {
    void claimAndRelease();
    history.push(routerPaths.adjudication);
  }

  const isClaimed = claimedCvrIds.has(currentCvrId);
  const statusText = `Ballot ${format.count(queueIndex + 1)} of ${format.count(
    queue.length
  )}`;

  return (
    <HostBallotAdjudicationScreenDataLoader
      cvrId={currentCvrId}
      statusText={statusText}
      isClaimed={isClaimed}
      isLastBallot={queueIndex >= queue.length - 1}
      onAcceptDone={navigateNext}
      onSkip={navigateNext}
      onBack={queueIndex > 0 ? () => navigateTo(queueIndex - 1) : undefined}
      onExit={navigateExit}
    />
  );
}

function HostBallotAdjudicationScreenDataLoader({
  cvrId,
  ...rest
}: {
  cvrId: Id;
  statusText: string;
  isClaimed: boolean;
  isLastBallot: boolean;
  onAcceptDone: () => void;
  onSkip: () => void;
  onBack?: () => void;
  onExit: () => void;
}): JSX.Element {
  const adjudicationDataQuery = getBallotAdjudicationDataQuery.useQuery({
    cvrId,
  });
  const ballotImagesQuery = getBallotImagesQuery.useQuery({ cvrId });
  const writeInCandidatesQuery = getWriteInCandidatesQuery.useQuery();
  const systemSettingsQuery = getSystemSettingsQuery.useQuery();

  const { mutateAsync: resolveBallotTagsMutation } =
    resolveBallotTags.useMutation();
  const { mutateAsync: adjudicateCvrContestMutation } =
    adjudicateCvrContest.useMutation();

  if (
    !adjudicationDataQuery.isSuccess ||
    !ballotImagesQuery.isSuccess ||
    !writeInCandidatesQuery.isSuccess ||
    !systemSettingsQuery.isSuccess
  ) {
    return (
      <Screen>
        <Main flexRow>
          <Loading isFullscreen />
        </Main>
      </Screen>
    );
  }

  return (
    <BallotAdjudicationScreen
      cvrId={cvrId}
      ballotAdjudicationData={adjudicationDataQuery.data}
      ballotImages={ballotImagesQuery.data}
      writeInCandidates={writeInCandidatesQuery.data}
      systemSettings={systemSettingsQuery.data}
      onResolveBallotTags={() => resolveBallotTagsMutation({ cvrId })}
      onAdjudicateCvrContest={(input) => adjudicateCvrContestMutation(input)}
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
  isLastBallot?: boolean;
  onResolveBallotTags: () => Promise<void>;
  onAdjudicateCvrContest: (input: AdjudicatedCvrContest) => Promise<void>;
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
  isLastBallot,
  onResolveBallotTags,
  onAdjudicateCvrContest,
  onAcceptDone,
  onSkip,
  onBack,
  onExit,
}: BallotAdjudicationScreenProps): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  const election = assertDefined(electionDefinition?.election);

  const [selectedSide, setSelectedSide] = useState<Side>('front');
  const [selectedContestId, setSelectedContestId] = useState<ContestId | null>(
    null
  );
  const [hoveredContestId, setHoveredContestId] = useState<ContestId | null>(
    null
  );
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Default to back side if the first pending contest is on the back
  useEffect(() => {
    const { contests } = ballotAdjudicationData;
    const { backContests: back } = groupContestsBySide(
      ballotImages,
      contests,
      election
    );
    const backIds = new Set(back.map((item) => item.contest.id));
    const firstPending = contests
      .filter((c) => c.tag !== null)
      .find((c) => c.tag && !c.tag.isResolved);
    if (firstPending && backIds.has(firstPending.contestId)) {
      setSelectedSide('back');
    } else {
      setSelectedSide('front');
    }
  }, [cvrId, ballotAdjudicationData, ballotImages, election]);

  const cvrTag = ballotAdjudicationData.tag;
  const { front, back } = ballotImages;
  const visibleImage = selectedSide === 'front' ? front : back;

  const contestAdjudicationData = ballotAdjudicationData.contests;
  const { frontContests: frontContestItems, backContests: backContestItems } =
    groupContestsBySide(ballotImages, contestAdjudicationData, election);
  const writeInCandidateNamesById = new Map(
    writeInCandidates.map((c) => [c.id, c.name])
  );
  const showUndervoteStatus = systemSettings.adminAdjudicationReasons.includes(
    AdjudicationReason.Undervote
  );

  const allResolved =
    contestAdjudicationData.every((c) => !c.tag || c.tag.isResolved) ||
    (cvrTag?.isBlankBallot &&
      contestAdjudicationData.every(
        (c) => !c.tag || c.tag.isResolved || isContestTagOnlyUndervote(c.tag)
      ));

  const hasUnresolvedWriteIns = contestAdjudicationData.some(
    (c) =>
      c.tag &&
      !c.tag.isResolved &&
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
      await onResolveBallotTags();
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
      [...frontContestItems, ...backContestItems],
      (i) => i.contest.id === hoveredContestId
    );
    return Boolean(
      item.adjudicationData.tag && !item.adjudicationData.tag.isResolved
    );
  })();

  const ballotBounds =
    visibleImage.type === 'hmpb' ? visibleImage.ballotCoordinates : undefined;

  if (selectedContestId && !isClaimed) {
    return (
      <ContestAdjudicationScreen
        cvrId={cvrId}
        side={
          frontContestItems.some(
            (item) => item.contest.id === selectedContestId
          )
            ? 'front'
            : 'back'
        }
        onClose={onCloseContest}
        contestAdjudicationData={find(
          contestAdjudicationData,
          (c) => c.contestId === selectedContestId
        )}
        ballotImages={ballotImages}
        writeInCandidates={writeInCandidates.filter(
          (c) => c.contestId === selectedContestId
        )}
        onAdjudicateCvrContest={onAdjudicateCvrContest}
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
              ballotBounds={ballotBounds}
              hasWarning={hoveredContestHasWarning}
              highlightBounds={hoveredContestBounds}
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
              onPress={onExit}
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
              backContests={backContestItems}
              cvrTag={cvrTag}
              election={election}
              frontContests={frontContestItems}
              onHover={onContestHover}
              onSelect={(contestId) => setSelectedContestId(contestId)}
              onSelectSide={setSelectedSide}
              selectedSide={selectedSide}
              showUndervoteStatus={showUndervoteStatus}
              writeInCandidateNamesById={writeInCandidateNamesById}
            />
          )}
          <PanelFooter>
            {statusText && <SmallText>{statusText}</SmallText>}
            <FooterNav>
              {isClaimed ? (
                <React.Fragment>
                  {onSkip && (
                    <PrimaryNavButton
                      onPress={onSkip}
                      rightIcon={isLastBallot ? 'Done' : 'Next'}
                      variant="primary"
                    >
                      {isLastBallot ? 'Done' : 'Next'}
                    </PrimaryNavButton>
                  )}
                  {onBack && (
                    <SecondaryNavButton icon="Previous" onPress={onBack}>
                      Back
                    </SecondaryNavButton>
                  )}
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <PrimaryNavButton
                    icon="Done"
                    onPress={onAcceptAndNext}
                    disabled={hasUnresolvedWriteIns}
                    variant={allResolved ? 'primary' : 'neutral'}
                  >
                    Accept
                  </PrimaryNavButton>
                  {onSkip && (
                    <SecondaryNavButton onPress={onSkip} rightIcon="Next">
                      Skip
                    </SecondaryNavButton>
                  )}
                  {onBack && (
                    <SecondaryNavButton icon="Previous" onPress={onBack}>
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
    </Screen>
  );
}
