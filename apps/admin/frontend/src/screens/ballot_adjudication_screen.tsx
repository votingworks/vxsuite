import { useContext, useEffect, useLayoutEffect, useState } from 'react';
import styled from 'styled-components';
import {
  Button,
  Loading,
  Main,
  Modal,
  P,
  Screen,
  SegmentedButton,
} from '@votingworks/ui';
import {
  AdjudicationReason,
  AnyContest,
  ContestId,
  Election,
} from '@votingworks/types';
import { format } from '@votingworks/utils';
import type { BallotImages } from '@votingworks/admin-backend';
import { useHistory } from 'react-router-dom';
import { assertDefined } from '@votingworks/basics';
import {
  getBallotAdjudicationData,
  getBallotAdjudicationQueue,
  getBallotImagesAndLayouts,
  getNextCvrIdForBallotAdjudication,
  getSystemSettings,
  getWriteInCandidates,
} from '../api';
import { routerPaths } from '../router_paths';
import {
  BallotStaticImageViewer,
  UnableToLoadImageCallout,
} from '../components/adjudication_ballot_image_viewer';
import { AdjudicationContestList } from '../components/adjudication_contest_list';
import { AppContext } from '../contexts/app_context';
import { ContestAdjudicationScreen } from './contest_adjudication_screen';

type BallotSide = 'front' | 'back';

const ADJUDICATION_PANEL_WIDTH = '23.5rem';
const DEFAULT_PADDING = '0.75rem';

const BallotPanel = styled.div`
  background: black;
  flex: 1;
  position: relative;
`;

const BallotSideToggle = styled.div<{ hasHighlight?: boolean }>`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  position: absolute;
  top: 0;
  z-index: 2;
  background: ${(p) => (p.hasHighlight ? 'none' : 'rgba(0, 0, 0, 50%)')};
  width: 100%;
  padding: 0.5rem;
  padding-right: 1rem;

  > span {
    height: 2.3rem;
    padding-bottom: -0.3rem;
  }
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
  gap: 0;
`;

const BallotInfoText = styled.p`
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1;
  margin: 0;
`;

const BallotMetadata = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0;
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
  election: Election | undefined,
  contestIds: ContestId[],
  ballotImages: BallotImages
): { frontContests: AnyContest[]; backContests: AnyContest[] } {
  if (!election) {
    return { frontContests: [], backContests: [] };
  }

  const contestsById = new Map(election.contests.map((c) => [c.id, c]));

  const { front, back } = ballotImages;

  // For BMD ballots, all contests go to the front
  if (front.type === 'bmd') {
    return {
      frontContests: contestIds
        .map((id) => contestsById.get(id))
        .filter((c): c is AnyContest => c !== undefined),
      backContests: [],
    };
  }

  const frontContestIdSet = new Set(
    front.type === 'hmpb' ? front.layout.contests.map((c) => c.contestId) : []
  );
  const backContestIdSet = new Set(
    back.type === 'hmpb' ? back.layout.contests.map((c) => c.contestId) : []
  );

  const frontContests: AnyContest[] = [];
  const backContests: AnyContest[] = [];

  for (const contestId of contestIds) {
    const contest = contestsById.get(contestId);
    if (!contest) continue;

    if (frontContestIdSet.has(contestId)) {
      frontContests.push(contest);
    } else if (backContestIdSet.has(contestId)) {
      backContests.push(contest);
    }
  }

  return { frontContests, backContests };
}

export function BallotAdjudicationScreen(): JSX.Element {
  // Queries and mutations
  const { electionDefinition } = useContext(AppContext);
  const history = useHistory();
  const ballotQueueQuery = getBallotAdjudicationQueue.useQuery();
  const nextCvrIdQuery = getNextCvrIdForBallotAdjudication.useQuery();

  const [maybeCvrQueueIndex, setMaybeCvrQueueIndex] = useState<number>();
  const isQueueReady =
    maybeCvrQueueIndex !== undefined && ballotQueueQuery.data !== undefined;
  const maybeCurrentCvrId = isQueueReady
    ? ballotQueueQuery.data[maybeCvrQueueIndex]
    : undefined;

  const [selectedSide, setSelectedSide] = useState<BallotSide>('front');
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
  const ballotImagesQuery = getBallotImagesAndLayouts.useQuery(
    maybeCurrentCvrId ? { cvrId: maybeCurrentCvrId } : undefined
  );
  const writeInCandidatesQuery = getWriteInCandidates.useQuery();
  const systemSettingsQuery = getSystemSettings.useQuery();

  // Prefetch the next and previous ballot images
  const prefetchImageViews = getBallotImagesAndLayouts.usePrefetch();
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
  }, [
    selectedContestId,
    maybeCvrQueueIndex,
    ballotQueueQuery,
    prefetchImageViews,
  ]);

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
  useLayoutEffect(() => {
    if (
      !ballotAdjudicationDataQuery.isSuccess ||
      !ballotImagesQuery.isSuccess ||
      !electionDefinition
    ) {
      return;
    }
    const { contests } = ballotAdjudicationDataQuery.data;
    const { backContests: back } = groupContestsBySide(
      electionDefinition.election,
      contests.map((c) => c.contestId),
      ballotImagesQuery.data
    );
    const backIds = new Set(back.map((c) => c.id));
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
    electionDefinition,
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

  const cvrId = assertDefined(maybeCurrentCvrId);
  const election = electionDefinition?.election;
  const ballotImages = ballotImagesQuery.data;
  const { front, back } = ballotImages;
  const activeImage = selectedSide === 'front' ? front : back;
  const queue = ballotQueueQuery.data;
  const queueIndex = maybeCvrQueueIndex;

  const adjudicationContests = ballotAdjudicationDataQuery.data.contests;
  const { frontContests, backContests } = groupContestsBySide(
    election,
    adjudicationContests.map((c) => c.contestId),
    ballotImages
  );
  const tagsByContestId = new Map(
    adjudicationContests
      .filter((c) => c.tag !== null)
      .map((c) => [c.contestId, c.tag])
  );
  const writeInCandidateNames = new Map(
    writeInCandidatesQuery.data.map((c) => [c.id, c.name])
  );
  const showUndervoteTransitions =
    systemSettingsQuery.data.adminAdjudicationReasons.includes(
      AdjudicationReason.Undervote
    );

  const allResolved = adjudicationContests.every(
    (c) => !c.tag || c.tag.isResolved
  );
  const onFirstBallot = queueIndex <= 0;
  const onLastBallot = queueIndex >= queue.length - 1;

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
    confirmAcceptAndNext();
  }

  function confirmAcceptAndNext(): void {
    setShowConfirmModal(false);
    if (onLastBallot) {
      history.push(routerPaths.adjudication);
    } else {
      setMaybeCvrQueueIndex(queueIndex + 1);
    }
  }

  function onClose(): void {
    history.push(routerPaths.adjudication);
  }

  function onContestHover(contestId: ContestId | null): void {
    setHoveredContestId(contestId);
    if (contestId) {
      if (backContests.some((c) => c.id === contestId)) {
        setSelectedSide('back');
      } else {
        setSelectedSide('front');
      }
    }
  }

  const hoveredContestBounds = (() => {
    if (!hoveredContestId || activeImage.type !== 'hmpb') return undefined;
    return activeImage.layout.contests.find(
      (c) => c.contestId === hoveredContestId
    )?.bounds;
  })();

  const ballotBounds =
    activeImage.type === 'hmpb' ? activeImage.ballotCoordinates : undefined;

  if (selectedContestId) {
    return (
      <ContestAdjudicationScreen
        cvrId={cvrId}
        side={
          frontContests.some((contest) => contest.id === selectedContestId)
            ? 'front'
            : 'back'
        }
        onClose={() => setSelectedContestId(null)}
        contestAdjudicationData={assertDefined(
          adjudicationContests.find((c) => c.contestId === selectedContestId)
        )}
        ballotImages={ballotImages}
      />
    );
  }

  return (
    <Screen>
      <Main flexRow>
        <BallotPanel>
          {back && (
            <BallotSideToggle hasHighlight={!!hoveredContestBounds}>
              <SegmentedButton
                label="Ballot Side"
                hideLabel
                options={[
                  { id: 'front', label: 'Front' },
                  { id: 'back', label: 'Back' },
                ]}
                selectedOptionId={selectedSide}
                onChange={setSelectedSide}
              />
            </BallotSideToggle>
          )}
          {!activeImage?.imageUrl ? (
            <UnableToLoadImageCallout />
          ) : (
            <BallotStaticImageViewer
              imageUrl={activeImage.imageUrl}
              highlightBounds={hoveredContestBounds}
              ballotBounds={ballotBounds}
            />
          )}
        </BallotPanel>
        <AdjudicationPanel>
          <PanelHeader>
            <BallotInfo>
              {/* <BallotIdCaption>ID: {cvrId.slice(-4)}</BallotIdCaption> */}
              <BallotInfoText>
                Ballot ID: {cvrId.substring(0, 4)}
              </BallotInfoText>
            </BallotInfo>
            <Button
              fill="outlined"
              color="inverseNeutral"
              icon="X"
              onPress={onClose}
              style={{ padding: '0.3rem .75rem', fontSize: '.8rem' }}
            >
              Exit
            </Button>
          </PanelHeader>
          {election && (
            <AdjudicationContestList
              frontContests={frontContests}
              backContests={backContests}
              election={election}
              tagsByContestId={tagsByContestId}
              adjudicationContests={adjudicationContests}
              writeInCandidateNames={writeInCandidateNames}
              showUndervoteTransitions={showUndervoteTransitions}
              onSelect={(contestId) => setSelectedContestId(contestId)}
              onHover={onContestHover}
              onSelectSide={setSelectedSide}
            />
          )}
          <PanelFooter>
            <BallotMetadata>
              <SmallText>
                Ballot {format.count(queueIndex + 1)} of{' '}
                {format.count(queue.length)}
              </SmallText>
            </BallotMetadata>
            <FooterNav>
              <PrimaryNavButton
                icon="Done"
                onPress={onAcceptAndNext}
                variant={allResolved ? 'primary' : 'neutral'}
              >
                {onLastBallot ? 'Accept' : 'Accept'}
              </PrimaryNavButton>
              <SecondaryNavButton onPress={onSkip} rightIcon="Next">
                {onLastBallot ? 'Exit' : 'Skip'}
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
