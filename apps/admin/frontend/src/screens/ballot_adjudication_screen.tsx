import { useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import { Button, Loading, Main, Modal, P, Screen } from '@votingworks/ui';
import {
  AdjudicationReason,
  ContestId,
  Election,
  Id,
  Side,
} from '@votingworks/types';
import { format } from '@votingworks/utils';
import type {
  BallotImages,
  ContestAdjudicationData,
} from '@votingworks/admin-backend';
import { useHistory } from 'react-router-dom';
import { assert, assertDefined, find } from '@votingworks/basics';
import {
  setCvrResolved,
  getBallotAdjudicationData,
  getBallotAdjudicationQueue,
  getBallotImages,
  getNextCvrIdForBallotAdjudication,
  getSystemSettings,
  getWriteInCandidates,
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
import { isContestTagOnlyUndervote } from '../utils/adjudication';

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
    <BallotAdjudicationScreen
      queue={queue}
      initialQueueIndex={initialQueueIndex}
    />
  );
}

interface BallotAdjudicationScreenProps {
  queue: Id[];
  initialQueueIndex: number;
}

function BallotAdjudicationScreen({
  queue,
  initialQueueIndex,
}: BallotAdjudicationScreenProps): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  const election = assertDefined(electionDefinition?.election);
  const history = useHistory();

  const [queueIndex, setQueueIndex] = useState(initialQueueIndex);
  const currentCvrId = queue[queueIndex];
  const [selectedSide, setSelectedSide] = useState<Side>('front');
  const [selectedContestId, setSelectedContestId] = useState<ContestId | null>(
    null
  );
  const [hoveredContestId, setHoveredContestId] = useState<ContestId | null>(
    null
  );
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const ballotAdjudicationDataQuery = getBallotAdjudicationData.useQuery({
    cvrId: currentCvrId,
  });
  const ballotImagesQuery = getBallotImages.useQuery({
    cvrId: currentCvrId,
  });
  const writeInCandidatesQuery = getWriteInCandidates.useQuery();
  const systemSettingsQuery = getSystemSettings.useQuery();
  const setCvrResolvedMutation = setCvrResolved.useMutation();

  // Prefetch the next and previous ballot images
  const prefetchImageViews = getBallotImages.usePrefetch();
  useEffect(() => {
    const nextCvrId = queue[queueIndex + 1];
    if (nextCvrId) {
      void prefetchImageViews({ cvrId: nextCvrId });
    }
    const prevCvrId = queue[queueIndex - 1];
    if (prevCvrId) {
      void prefetchImageViews({ cvrId: prevCvrId });
    }
  }, [queueIndex, queue, prefetchImageViews]);

  // Default to back side if the first pending contest is on the back
  useEffect(() => {
    if (
      !ballotAdjudicationDataQuery.isSuccess ||
      !ballotImagesQuery.isSuccess
    ) {
      return;
    }
    const { contests } = ballotAdjudicationDataQuery.data;
    const ballotImages = ballotImagesQuery.data;
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
  }, [
    currentCvrId,
    ballotAdjudicationDataQuery.isSuccess,
    ballotAdjudicationDataQuery.data,
    ballotImagesQuery.isSuccess,
    ballotImagesQuery.data,
    election,
  ]);

  if (
    !ballotAdjudicationDataQuery.isSuccess ||
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

  const onFirstBallot = queueIndex <= 0;
  const onLastBallot = queueIndex >= queue.length - 1;

  const cvrId = currentCvrId;
  const cvrTag = ballotAdjudicationDataQuery.data.tag;
  const ballotImages = ballotImagesQuery.data;
  const { front, back } = ballotImages;
  const visibleImage = selectedSide === 'front' ? front : back;

  const contestAdjudicationData = ballotAdjudicationDataQuery.data.contests;
  const { frontContests: frontContestItems, backContests: backContestItems } =
    groupContestsBySide(ballotImages, contestAdjudicationData, election);
  const writeInCandidateNamesById = new Map(
    writeInCandidatesQuery.data.map((c) => [c.id, c.name])
  );
  const showUndervoteStatus =
    systemSettingsQuery.data.adminAdjudicationReasons.includes(
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

  function onBack(): void {
    if (!onFirstBallot) {
      setQueueIndex(queueIndex - 1);
    }
  }

  function navigateNext(): void {
    if (onLastBallot) {
      history.push(routerPaths.adjudication);
    } else {
      setQueueIndex(queueIndex + 1);
    }
  }

  function onSkip(): void {
    navigateNext();
  }

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
      await setCvrResolvedMutation.mutateAsync({ cvrId });
      navigateNext();
    } catch {
      // Handled by default query client error handling
    }
  }

  function onExit(): void {
    history.push(routerPaths.adjudication);
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

  if (selectedContestId) {
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
          <PanelFooter>
            <SmallText>
              Ballot {format.count(queueIndex + 1)} of{' '}
              {format.count(queue.length)}
            </SmallText>
            <FooterNav>
              <PrimaryNavButton
                icon="Done"
                onPress={onAcceptAndNext}
                disabled={hasUnresolvedWriteIns}
                variant={allResolved ? 'primary' : 'neutral'}
              >
                Accept
              </PrimaryNavButton>
              <SecondaryNavButton onPress={onSkip} rightIcon="Next">
                Skip
              </SecondaryNavButton>
              <SecondaryNavButton
                disabled={onFirstBallot}
                icon="Previous"
                onPress={onBack}
              >
                Back
              </SecondaryNavButton>
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
