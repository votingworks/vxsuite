import { useContext, useEffect, useState } from 'react';
import styled from 'styled-components';

import {
  Candidate,
  CandidateContest,
  getContestDistrictName,
  Id,
} from '@votingworks/types';
import {
  Button,
  Main,
  Screen,
  Font,
  H3,
  LinkButton,
  Loading,
} from '@votingworks/ui';
import { assert, find } from '@votingworks/basics';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  getWriteInAdjudicationCvrQueue,
  getCvrWriteInImageViews,
  getFirstPendingWriteInCvrId,
  GetCastVoteRecordVoteInfo,
  useApiClient,
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

const BallotPanel = styled.div`
  background: black;
  flex: 1;
`;

const AdjudicationPanel = styled.div`
  display: flex;
  flex-direction: column;
  width: 20rem;
  height: 100vh;
  margin: 0;
  padding: 1rem 1rem 0;
  border-left: 4px solid black;
`;

const StickyFooter = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  height: 4.375rem;
  width: calc(100% - 20rem);
  background: rgba(255, 255, 255, 85%); /* Semi-transparent black */
  color: black;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 1.25rem;
  font-weight: bold;
  z-index: 10; /* Ensures it stays on top */
  padding: 1rem 1.5rem;
`;

const Navigation = styled.div`
  display: flex;
  gap: 1rem;
`;

const Row = styled.div`
  display: flex;
  justify-content: space-between;

  &:not(:first-child) {
    margin-top: 1rem;
  }
`;

const ContestInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const StyledH2 = styled.h2`
  color: ${(p) => p.theme.colors.onBackgroundMuted};
  font-size: 1rem;
  font-weight: 500;
  margin: 0;
`;

const StyledP = styled.p`
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
`;

const SeatCountCaption = styled.caption`
  color: ${(p) => p.theme.colors.onBackgroundMuted};
  font-size: 0.875rem;
  font-weight: 500;
  text-align: left;
`;

const CandidateButtonList = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
  margin-top: 1rem;
  overflow-y: scroll;
  flex-grow: 1;
  min-height: 0;

  /* top and left padding to prevent clipping of children's borders
  * bottom padding so children aren't against the bottom of the screen
  * right padding so extra space for a scrollbar */
  padding: 0.25rem 0.75rem 1rem 0.25rem;
`;

// styles closely imitate our RadioGroup buttons, but we don't use RadioGroup
// because we need to be able to deselect options by clicking them again
const CandidateStyledButton = styled(Button)`
  border-color: ${(p) => p.theme.colors.outline};
  border-width: ${(p) => p.theme.sizes.bordersRem.thin}rem;
  flex-wrap: nowrap;
  font-weight: ${(p) => p.theme.sizes.fontWeight.regular};
  justify-content: start;
  padding-left: 0.5rem;
  text-align: left;
  width: 100%;
  word-break: break-word;
  flex-shrink: 0;
  margin: 8px;

  /* Increase contrast between selected/unselected options when disabled by
   * removing the darkening filter for unselected options. */
  &[disabled] {
    ${(p) => p.color === 'neutral' && `filter: none;`}
  }
`;

function CandidateButton({
  candidate,
  isSelected,
  onSelect,
  onDeselect,
}: {
  candidate: Pick<Candidate, 'id' | 'name'>;
  isSelected?: boolean;
  onSelect: () => void;
  onDeselect: () => void;
}) {
  return (
    <CandidateStyledButton
      key={candidate.id}
      onPress={() => {
        if (!isSelected) {
          onSelect();
        } else {
          onDeselect();
        }
      }}
      color={isSelected ? 'primary' : 'neutral'}
      fill={isSelected ? 'tinted' : 'outlined'}
      icon={isSelected ? 'CircleDot' : 'Circle'}
    >
      {candidate.name}
    </CandidateStyledButton>
  );
}

export function ContestAdjudicationScreen(): JSX.Element {
  const { contestId } = useParams<ContestAdjudicationScreenParams>();
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  const contest = find(
    election.contests,
    (c) => c.id === contestId
  ) as CandidateContest;

  // Current cvr, write-in, and queue management
  const writeInCvrQueueQuery = getWriteInAdjudicationCvrQueue.useQuery({
    contestId: contest.id,
  });
  const firstPendingWriteInCvrIdQuery = getFirstPendingWriteInCvrId.useQuery({
    contestId: contest.id,
  });
  const [focusedWriteInId, setFocusedWriteInId] = useState<string>('');
  const [scrollIndex, setScrollIndex] = useState<number | undefined>(undefined);
  const scrollIndexInitialized = scrollIndex !== undefined;
  const currentCvrId = scrollIndexInitialized
    ? writeInCvrQueueQuery.data?.[scrollIndex]
    : undefined;
  const numBallots = writeInCvrQueueQuery.data?.length;
  const [hasPageLoaded, setHasPageLoaded] = useState(false);

  // Ballot images
  const writeInImageViewsQuery = getCvrWriteInImageViews.useQuery(
    { cvrId: currentCvrId ?? 'no-op' },
    !!currentCvrId
  );

  const writeInImageViews = writeInImageViewsQuery.data;
  const firstWriteInImage = writeInImageViews?.[0];
  const focusedWriteIn = focusedWriteInId
    ? writeInImageViews?.find((item) => item.optionId === focusedWriteInId)
    : undefined;
  const isHmpbWriteIn =
    firstWriteInImage && 'ballotCoordinates' in firstWriteInImage;
  const isBmdWriteIn =
    firstWriteInImage && 'machineMarkedText' in firstWriteInImage;

  // Initialize votes and manage vote adjudications
  const getCastVoteRecordVoteInfoQuery = GetCastVoteRecordVoteInfo.useQuery(
    { cvrId: currentCvrId || '' },
    !!currentCvrId // only run query when there is a valid CvrId
  );
  const cvrVoteInfo = getCastVoteRecordVoteInfoQuery.data;
  const originalVotes = cvrVoteInfo?.votes[contestId];

  const [voteState, setVoteState] = useState<Record<string, boolean>>({});
  const [shouldResetVoteState, setShouldResetVoteState] = useState(true);
  const voteStateInitialized = Object.keys(voteState).length > 0;

  function toggleVote(id: string) {
    setVoteState((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  // Write-in value entry state
  const [writeInValues, setWriteInValues] = useState<Record<string, string>>(
    {}
  );
  function updateUnadjudicatedWriteInValue(id: string, newVal: string) {
    setWriteInValues((prev) => ({
      ...prev,
      [id]: newVal,
    }));
  }

  const officialCandidates = [...contest.candidates]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((candidate) => !candidate.isWriteIn);
  const seatCount = contest.seats;
  const isOvervoteOriginal = (originalVotes?.length || 0) > seatCount;
  const isOvervote =
    Object.values(voteState).filter(Boolean).length > seatCount;
  const numWriteIns = Object.entries(voteState).filter(
    ([key, val]) => val && key.startsWith('write-in')
  ).length;
  const numAdjudicatedWriteIns = Object.entries(voteState).filter(
    ([key, val]) => val && key.startsWith('write-in') && writeInValues[key]
  ).length;
  const allWriteInsAdjudicated = numWriteIns === numAdjudicatedWriteIns;

  // Initialize vote/write-in management and reset on cvr scroll
  useEffect(() => {
    if (
      getCastVoteRecordVoteInfoQuery.isSuccess &&
      originalVotes &&
      (!voteStateInitialized || shouldResetVoteState)
    ) {
      const newVoteState: Record<string, boolean> = {};
      for (const c of officialCandidates) {
        newVoteState[c.id] = originalVotes.includes(c.id);
      }
      for (let i = 0; i < seatCount; i += 1) {
        newVoteState[`write-in-${i}`] = originalVotes.includes(`write-in-${i}`);
      }
      setVoteState(newVoteState);
      setWriteInValues({});
      setShouldResetVoteState(false);
    }
  }, [
    getCastVoteRecordVoteInfoQuery,
    officialCandidates,
    originalVotes,
    seatCount,
    shouldResetVoteState,
    voteStateInitialized,
  ]);

  // Initiate scrollIndex
  useEffect(() => {
    if (
      !scrollIndexInitialized &&
      firstPendingWriteInCvrIdQuery.isSuccess &&
      writeInCvrQueueQuery.isSuccess
    ) {
      const firstPendingWriteInCvrId = firstPendingWriteInCvrIdQuery.data;
      const cvrQueue = writeInCvrQueueQuery.data;
      if (firstPendingWriteInCvrId) {
        setScrollIndex(cvrQueue.indexOf(firstPendingWriteInCvrId));
      } else {
        setScrollIndex(0);
      }
    }
  }, [
    firstPendingWriteInCvrIdQuery,
    writeInCvrQueueQuery,
    scrollIndexInitialized,
  ]);

  // Prefetch the next and previous ballot images
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  useEffect(() => {
    if (!writeInCvrQueueQuery.isSuccess || !scrollIndexInitialized) return;

    function prefetch(cvrId: Id) {
      void queryClient.prefetchQuery({
        queryKey: getCvrWriteInImageViews.queryKey({ cvrId }),
        queryFn: () => apiClient.getCvrWriteInImageViews({ cvrId }),
      });
    }

    const nextWriteInId = writeInCvrQueueQuery.data[scrollIndex + 1];
    if (nextWriteInId) {
      prefetch(nextWriteInId);
    }
    const previousWriteInId = writeInCvrQueueQuery.data[scrollIndex - 1];
    if (previousWriteInId) {
      prefetch(previousWriteInId);
    }
  }, [
    apiClient,
    queryClient,
    scrollIndex,
    scrollIndexInitialized,
    writeInCvrQueueQuery,
  ]);

  if (
    !scrollIndexInitialized ||
    !voteStateInitialized ||
    (!hasPageLoaded &&
      (!firstPendingWriteInCvrIdQuery.isSuccess ||
        !writeInCvrQueueQuery.isSuccess ||
        !writeInImageViewsQuery.isSuccess))
  ) {
    return (
      <NavigationScreen title="Contest Adjudication">
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  if (!hasPageLoaded) {
    setHasPageLoaded(true);
  }

  return (
    <Screen>
      <Main flexRow>
        <BallotPanel>
          {isHmpbWriteIn ? (
            <BallotZoomImageViewer
              key={currentCvrId} // Reset zoom state for each write-in
              imageUrl={firstWriteInImage.imageUrl}
              ballotBounds={firstWriteInImage.ballotCoordinates}
              zoomedInBounds={
                focusedWriteIn && 'writeInCoordinates' in focusedWriteIn
                  ? focusedWriteIn.writeInCoordinates
                  : firstWriteInImage.contestCoordinates
              }
            />
          ) : isBmdWriteIn ? (
            <BallotStaticImageViewer
              key={currentCvrId}
              imageUrl={firstWriteInImage.imageUrl}
            />
          ) : null}
          <StickyFooter>
            <Navigation>
              <Button
                disabled={scrollIndex === 0}
                onPress={() => {
                  setScrollIndex(scrollIndex - 1);
                  setShouldResetVoteState(true);
                }}
                icon="Previous"
                fill="outlined"
                style={{ backgroundColor: 'white' }}
              >
                Previous
              </Button>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '5rem',
                }}
              >
                <span>
                  {scrollIndex + 1} of {numBallots}
                </span>
                <span style={{ fontSize: '0.75rem' }}>
                  Ballot ID: {currentCvrId?.substring(0, 4)}
                </span>
              </div>
              <Button
                style={{ backgroundColor: 'white' }}
                onPress={() => {
                  setScrollIndex(scrollIndex + 1);
                  setShouldResetVoteState(true);
                }}
                rightIcon="Next"
                disabled={scrollIndex + 1 === numBallots}
              >
                Skip
              </Button>
            </Navigation>
            {scrollIndex + 1 === numBallots ? (
              <LinkButton
                variant={allWriteInsAdjudicated ? 'primary' : 'neutral'}
                to={routerPaths.writeIns}
                icon="Done"
              >
                Finish
              </LinkButton>
            ) : (
              <Button
                onPress={() => {
                  setScrollIndex(scrollIndex + 1);
                  setShouldResetVoteState(true);
                }}
                icon="Done"
                variant={allWriteInsAdjudicated ? 'primary' : 'neutral'}
              >
                Resolve
              </Button>
            )}
          </StickyFooter>
        </BallotPanel>
        <AdjudicationPanel>
          <Row>
            <ContestInfo>
              <StyledH2>{getContestDistrictName(election, contest)}</StyledH2>
              <H3 as="h1" style={{ margin: 0 }}>
                <Font weight="bold">{contest.title} </Font>
                <Font weight="regular">Adjudication</Font>
              </H3>
              <SeatCountCaption>Vote for {seatCount}</SeatCountCaption>
            </ContestInfo>
            <LinkButton
              variant="neutral"
              fill="outlined"
              icon="X"
              to={routerPaths.writeIns}
              style={{ alignSelf: 'start', flexShrink: 0 }}
            >
              Close
            </LinkButton>
          </Row>
          <Row>
            <div>
              <StyledH2 style={{ marginBottom: '.25rem' }}>
                Original status
              </StyledH2>
              <StyledP>{isOvervoteOriginal ? 'Overvote' : 'Valid'}</StyledP>
            </div>
            <div>
              <StyledH2
                style={{ marginBottom: '.25rem', marginRight: '0.75rem' }}
              >
                Current status
              </StyledH2>
              <StyledP>{isOvervote ? 'Overvote' : 'Valid'}</StyledP>
            </div>
          </Row>
          <Row>
            <StyledH2 style={{ alignSelf: 'end' }}>
              Write-ins adjudicated
            </StyledH2>
            <StyledP style={{ marginRight: '0.75rem' }}>
              {numAdjudicatedWriteIns}/{numWriteIns}
            </StyledP>
          </Row>
          <CandidateButtonList key={currentCvrId}>
            {officialCandidates.map((candidate) => (
              <CandidateButton
                key={candidate.id}
                candidate={candidate}
                isSelected={voteState[candidate.id]}
                onSelect={() => toggleVote(candidate.id)}
                onDeselect={() => toggleVote(candidate.id)}
              />
            ))}
            {Array.from({ length: seatCount }).map((_, idx) => {
              const id = `write-in-${idx}`;
              const isSelected = voteState[id];
              if (isSelected) {
                return (
                  <WriteInAdjudicationButton
                    key={id}
                    isSelected
                    toggleVote={() => toggleVote(id)}
                    value={writeInValues[id]}
                    onInputFocus={() => setFocusedWriteInId(id)}
                    onInputBlur={() => setFocusedWriteInId('')}
                    onChange={(value) => {
                      if (value === 'invalid') {
                        toggleVote(id);
                      } else {
                        updateUnadjudicatedWriteInValue(id, value || '');
                      }
                      // setFocusedWriteInId('');
                    }}
                    officialCandidateOptions={officialCandidates.filter(
                      (candidate) => !voteState[candidate.id]
                    )}
                    // writeInOptions={[]}
                  />
                );
              }
              return (
                <CandidateButton
                  key={id}
                  candidate={{
                    id,
                    name: isSelected ? 'Unadjudicated Write-in' : 'Write-in',
                  }}
                  isSelected={isSelected}
                  onSelect={() => toggleVote(id)}
                  onDeselect={() => toggleVote(id)}
                />
              );
            })}
          </CandidateButtonList>
        </AdjudicationPanel>
      </Main>
    </Screen>
  );
}
