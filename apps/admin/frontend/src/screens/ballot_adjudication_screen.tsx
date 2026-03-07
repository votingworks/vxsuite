import { useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import { Button, Loading, Main, Modal, P, Screen } from '@votingworks/ui';
import {
  AdjudicationReason,
  ContestId,
  Election,
  Side,
} from '@votingworks/types';
import { format } from '@votingworks/utils';
import type {
  BallotImages,
  ContestAdjudicationData,
  CvrContestTag,
} from '@votingworks/admin-backend';
import { useHistory } from 'react-router-dom';
import { assert, assertDefined, find } from '@votingworks/basics';
import {
  resolveBallotTags,
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

function isContestTagOnlyUndervote(tag: CvrContestTag) {
  return (
    tag.hasUndervote &&
    !tag.hasMarginalMark &&
    !tag.hasWriteIn &&
    !tag.hasUnmarkedWriteIn &&
    !tag.hasOvervote
  );
}

export function BallotAdjudicationScreen(): JSX.Element {
  // Queries and mutations
  const { electionDefinition } = useContext(AppContext);
  const election = assertDefined(electionDefinition?.election);
  const history = useHistory();
  const resolveBallotTagsMutation = resolveBallotTags.useMutation();
  const ballotQueueQuery = getBallotAdjudicationQueue.useQuery();
  const nextCvrIdQuery = getNextCvrIdForBallotAdjudication.useQuery();

  const [maybeCvrQueueIndex, setMaybeCvrQueueIndex] = useState<number>();
  const isQueueReady =
    maybeCvrQueueIndex !== undefined && ballotQueueQuery.data !== undefined;
  const maybeCurrentCvrId = isQueueReady
    ? ballotQueueQuery.data[maybeCvrQueueIndex]
    : undefined;

  const [selectedSide, setSelectedSide] = useState<Side>('front');
  const [selectedContestId, setSelectedContestId] = useState<ContestId | null>(
    null
  );
  const [hoveredContestId, setHoveredContestId] = useState<ContestId | null>(
    null
  );
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const ballotAdjudicationDataQuery = getBallotAdjudicationData.useQuery(
    maybeCurrentCvrId ? { cvrId: maybeCurrentCvrId } : undefined
  );
  const ballotImagesQuery = getBallotImages.useQuery(
    maybeCurrentCvrId ? { cvrId: maybeCurrentCvrId } : undefined
  );
  const writeInCandidatesQuery = getWriteInCandidates.useQuery();
  const systemSettingsQuery = getSystemSettings.useQuery();

  // Prefetch the next and previous ballot images
  const prefetchImageViews = getBallotImages.usePrefetch();
  useEffect(() => {
    if (!ballotQueueQuery.isSuccess || maybeCvrQueueIndex === undefined) return;
    const nextCvrId = ballotQueueQuery.data[maybeCvrQueueIndex + 1];
    if (nextCvrId) {
      void prefetchImageViews({ cvrId: nextCvrId });
    }
    const prevCvrId = ballotQueueQuery.data[maybeCvrQueueIndex - 1];
    if (prevCvrId) {
      void prefetchImageViews({ cvrId: prevCvrId });
    }
  }, [maybeCvrQueueIndex, ballotQueueQuery, prefetchImageViews]);

  // Open to first pending cvr when queue data is loaded
  useEffect(() => {
    if (
      maybeCvrQueueIndex === undefined &&
      ballotQueueQuery.isSuccess &&
      nextCvrIdQuery.isSuccess
    ) {
      const cvrQueue = ballotQueueQuery.data;
      const cvrId = nextCvrIdQuery.data;
      if (cvrId) {
        setMaybeCvrQueueIndex(cvrQueue.indexOf(cvrId));
      } else {
        setMaybeCvrQueueIndex(0);
      }
    }
  }, [nextCvrIdQuery, ballotQueueQuery, maybeCvrQueueIndex]);

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
    maybeCurrentCvrId,
    ballotAdjudicationDataQuery.isSuccess,
    ballotAdjudicationDataQuery.data,
    ballotImagesQuery.isSuccess,
    ballotImagesQuery.data,
    election,
  ]);

  if (
    !ballotAdjudicationDataQuery.isSuccess ||
    !ballotImagesQuery.isSuccess ||
    !ballotQueueQuery.isSuccess ||
    !writeInCandidatesQuery.isSuccess ||
    !systemSettingsQuery.isSuccess ||
    maybeCvrQueueIndex === undefined
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
  const queueIndex = maybeCvrQueueIndex;
  const onFirstBallot = queueIndex <= 0;
  const onLastBallot = queueIndex >= queue.length - 1;

  const cvrId = assertDefined(maybeCurrentCvrId);
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
  const showUndervoteTransitions =
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
      setMaybeCvrQueueIndex(queueIndex - 1);
    }
  }

  function onSkip(): void {
    if (onLastBallot) {
      history.push(routerPaths.adjudication);
    } else {
      setMaybeCvrQueueIndex(queueIndex + 1);
    }
  }

  function onAcceptAndNext(): void {
    if (!allResolved) {
      setShowConfirmModal(true);
      return;
    }
    void confirmAcceptAndNext();
  }

  function navigateNext(): void {
    if (onLastBallot) {
      history.push(routerPaths.adjudication);
    } else {
      setMaybeCvrQueueIndex(queueIndex + 1);
    }
  }

  async function confirmAcceptAndNext(): Promise<void> {
    setShowConfirmModal(false);
    try {
      await resolveBallotTagsMutation.mutateAsync({ cvrId });
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
            showUndervoteTransitions={showUndervoteTransitions}
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
                {onLastBallot ? 'Finish' : 'Accept'}
              </PrimaryNavButton>
              <SecondaryNavButton onPress={onSkip} rightIcon="Next">
                {onLastBallot ? 'Exit' : 'Skip'}
              </SecondaryNavButton>
              <SecondaryNavButton
                disabled={onFirstBallot}
                icon="Previous"
                onPress={onBack}
              >
                Prev
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
