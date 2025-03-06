import { useContext, useEffect, useRef, useState } from 'react';
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
import { assert, find, throwIllegalValue } from '@votingworks/basics';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  getWriteInAdjudicationCvrQueue,
  getCvrWriteInImageViews,
  getFirstPendingWriteInCvrId,
  GetCastVoteRecordVoteInfo,
  useApiClient,
  adjudicateWriteIn,
  getCvrContestWriteIns,
  getWriteInCandidates,
  addWriteIn,
  addWriteInCandidate,
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
import { CandidateButton } from '../components/candidate_button';
import { normalizeWriteInName } from '../utils/write_ins';

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

// Overlay that blurs everything behind it
const PanelOverlay = styled.div`
  position: absolute; /* Covers the entire screen */
  top: 0;
  right: 0;
  width: 20rem;
  height: 100vh;
  background: rgba(0, 0, 0, 5%); /* Light darkening effect */
  backdrop-filter: blur(4px); /* Apply blur effect */
  z-index: 15; /* Ensure it's behind the dropdown but above the background */
  pointer-events: auto; /* Ensures clicks are intercepted */
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

const CandidateButtonList = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
  margin-top: 1rem;
  overflow-y: scroll;
  flex-grow: 1;
  min-height: 0;

  /* top and left padding to prevent clipping of children's onFocus borders,
  * bottom padding so children aren't against the bottom of the screen,
  * right padding so there is space for a scrollbar */
  padding: 0.25rem 0.75rem 1rem 0.25rem;
`;

export function ContestAdjudicationScreen(): JSX.Element {
  const { contestId } = useParams<ContestAdjudicationScreenParams>();
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  const contest = find(
    election.contests,
    (c) => c.id === contestId
  ) as CandidateContest;

  const writeInCvrQueueQuery = getWriteInAdjudicationCvrQueue.useQuery({
    contestId: contest.id,
  });
  const firstPendingWriteInCvrIdQuery = getFirstPendingWriteInCvrId.useQuery({
    contestId: contest.id,
  });

  const [focusedOptionId, setFocusedOptionId] = useState<string>('');
  const [scrollIndex, setScrollIndex] = useState<number | undefined>(undefined);
  const scrollIndexInitialized = scrollIndex !== undefined;
  const currentCvrId = scrollIndexInitialized
    ? writeInCvrQueueQuery.data?.[scrollIndex]
    : undefined;

  // Queries and mutations
  const cvrVoteInfoQuery = GetCastVoteRecordVoteInfo.useQuery(
    { cvrId: currentCvrId || '' }, // add contestId
    !!currentCvrId // only run query when there is a valid CvrId
  );
  const cvrContestWriteInsQuery = getCvrContestWriteIns.useQuery(
    { cvrId: currentCvrId ?? 'no-op', contestId },
    !!currentCvrId
  );
  const cvrContestWriteInImagesQuery = getCvrWriteInImageViews.useQuery(
    { cvrId: currentCvrId ?? 'no-op', contestId },
    !!currentCvrId
  );
  const contestWriteInCandidatesQuery = getWriteInCandidates.useQuery({
    contestId: contest.id,
  });

  const addWriteInMutation = addWriteIn.useMutation();
  const addWriteInCandidateMutation = addWriteInCandidate.useMutation();
  const adjudicateWriteInMutation = adjudicateWriteIn.useMutation();

  // Current cvr, write-in, and queue management

  const numBallots = writeInCvrQueueQuery.data?.length;
  const [hasPageLoaded, setHasPageLoaded] = useState(false);

  // CVR write-in data and images
  const writeIns = cvrContestWriteInsQuery.data;
  const writeInImages = cvrContestWriteInImagesQuery.data;
  const firstWriteInImage = writeInImages?.[0];
  const focusedWriteInImage = focusedOptionId
    ? writeInImages?.find((item) => item.optionId === focusedOptionId)
    : undefined;
  const isFocusedWriteInHmpb =
    firstWriteInImage && 'ballotCoordinates' in firstWriteInImage;
  const isFocusedWriteInBmd =
    firstWriteInImage && 'machineMarkedText' in firstWriteInImage;

  // Initialize votes and manage vote adjudications
  const cvrVoteInfo = cvrVoteInfoQuery.data;
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
  const [writeInState, setWriteInState] = useState<
    Record<string, string | 'invalid' | ''> // optionId to name OR 'invalid' OR '' (pending adjudication)
  >({});

  function updateWriteInState(optionId: string, newVal: string) {
    setWriteInState((prev) => ({
      ...prev,
      [optionId]: newVal,
    }));
  }

  const officialCandidates = contest.candidates.filter((c) => !c.isWriteIn);
  const officialCandidateIds = officialCandidates.map((item) => item.id);
  const writeInCandidates = contestWriteInCandidatesQuery.data;
  const writeInCandidateIds = writeInCandidates?.map((item) => item.id) || [];
  // const selectedWriteInCandidateNames = (function () {
  //   const selectedWriteIns: string[] = [];
  //   for (const [optionId, hasVote] of Object.entries(voteState)) {
  //     if (optionId.startsWith('write-in') && hasVote) {
  //       selectedWriteIns.push(writeInState[optionId]);
  //     }
  //   }
  //   return selectedWriteIns;
  // })();

  const seatCount = contest.seats;
  const isOvervoteOriginal = (originalVotes?.length || 0) > seatCount;
  const isOvervote =
    Object.values(voteState).filter(Boolean).length > seatCount;

  const numWriteIns = writeIns?.length;
  const numAdjudicatedWriteIns = writeIns?.filter(
    (item) => item.status === 'adjudicated'
  ).length;
  const allWriteInsAdjudicated = numWriteIns === numAdjudicatedWriteIns;

  const disallowedWriteInCandidateNames = [
    '',
    ...officialCandidates.map((c) => normalizeWriteInName(c.name)),
    ...(writeInCandidates?.map((c) => normalizeWriteInName(c.name)) || []),
  ];

  // Adjudication controls

  function addWriteInRecord(optionId: string) {
    if (!currentCvrId) return;

    // don't add new write in if one is already in state
    if (writeInState[optionId]) return;

    addWriteInMutation.mutate({
      contestId,
      optionId,
      cvrId: currentCvrId,
      name: '',
      side: undefined, // NEED to add
      isUnmarked: true, // NEED to confirm
    });
    updateWriteInState(optionId, '');
  }

  function adjudicateAsOfficialCandidate(
    officialCandidate: Candidate,
    optionId: string
  ): void {
    const writeIn = writeIns?.find((item) => item.optionId === optionId);
    assert(writeIn !== undefined);
    adjudicateWriteInMutation.mutate({
      writeInId: writeIn.id,
      type: 'official-candidate',
      candidateId: officialCandidate.id,
    });
    updateWriteInState(optionId, officialCandidate.name);
  }

  function adjudicateAsWriteInCandidate(
    writeInCandidate: Candidate,
    optionId: string
  ): void {
    const writeIn = writeIns?.find((item) => item.optionId === optionId);
    assert(writeIn !== undefined);
    adjudicateWriteInMutation.mutate({
      writeInId: writeIn.id,
      type: 'write-in-candidate',
      candidateId: writeInCandidate.id,
    });
    updateWriteInState(optionId, writeInCandidate.name);
  }

  async function createAndAdjudicateWriteInCandidate(
    name: string,
    optionId: string
  ) {
    if (!name) return;
    if (disallowedWriteInCandidateNames.includes(normalizeWriteInName(name))) {
      return;
    }

    try {
      const writeInCandidate = await addWriteInCandidateMutation.mutateAsync({
        contestId: contest.id,
        name,
      });
      adjudicateAsWriteInCandidate(writeInCandidate, optionId);
    } catch {
      // Handled by default query client error handling
    }
  }

  function adjudicateWriteInAsInvalid(optionId: string) {
    const writeInRecord = writeIns?.find((item) => item.optionId === optionId);
    if (!writeInRecord) return;
    adjudicateWriteInMutation.mutate({
      writeInId: writeInRecord.id,
      type: 'invalid',
    });
    updateWriteInState(optionId, 'invalid');
    if (voteState[optionId]) {
      toggleVote(optionId);
    }
  }

  function resetWriteInAdjudication(optionId: string): void {
    const writeInRecord = writeIns?.find((item) => item.optionId === optionId);
    if (!writeInRecord) return;
    adjudicateWriteInMutation.mutate({
      writeInId: writeInRecord.id,
      type: 'reset',
    });
    updateWriteInState(optionId, '');
  }

  // Initialize vote and write-in management; resets on cvr scroll
  useEffect(() => {
    if (
      cvrVoteInfoQuery.isSuccess &&
      cvrContestWriteInsQuery.isSuccess &&
      contestWriteInCandidatesQuery.isSuccess &&
      (!voteStateInitialized || shouldResetVoteState)
    ) {
      if (!originalVotes || !writeIns || !writeInCandidates) {
        return;
      }

      // Vote state: candidateId | writeInOptionId to boolean hasVote
      const newVoteState: Record<string, boolean> = {};
      for (const c of officialCandidates) {
        newVoteState[c.id] = originalVotes.includes(c.id);
      }
      for (let i = 0; i < seatCount; i += 1) {
        const optionId = `write-in-${i}`;
        newVoteState[optionId] = originalVotes.includes(optionId);
      }

      // think about how I want to represent writeIns, is the object I chose the right one going forward?

      // WriteIn state: optionId to string name
      const newWriteInState: Record<string, string> = {};
      for (const writeIn of writeIns) {
        const { optionId } = writeIn;
        if (writeIn.status === 'pending') {
          newWriteInState[optionId] = '';
          continue;
        }
        switch (writeIn.adjudicationType) {
          case 'official-candidate': {
            const candidate = officialCandidates.find(
              (c) => c.id === writeIn.candidateId
            );
            assert(candidate !== undefined);
            newWriteInState[optionId] = candidate.name;
            newVoteState[optionId] = true;
            break;
          }
          case 'write-in-candidate': {
            const candidate = writeInCandidates.find(
              (c) => c.id === writeIn.candidateId
            );
            assert(candidate !== undefined);
            newWriteInState[optionId] = candidate.name;
            newVoteState[optionId] = true;
            break;
          }
          case 'invalid': {
            newWriteInState[optionId] = 'invalid';
            newVoteState[optionId] = false;
            break;
          }
          default: {
            /* istanbul ignore next - @preserve */
            throwIllegalValue(writeIn, 'adjudicationType');
          }
        }
      }

      setVoteState(newVoteState);
      setWriteInState(newWriteInState);
      setShouldResetVoteState(false);
    }
  }, [
    cvrVoteInfoQuery.isSuccess,
    cvrContestWriteInsQuery.isSuccess,
    contestWriteInCandidatesQuery.isSuccess,
    officialCandidates,
    originalVotes,
    seatCount,
    shouldResetVoteState,
    voteStateInitialized,
    writeIns,
    writeInCandidates,
  ]);

  // Initiate scroll
  useEffect(() => {
    if (
      writeInCvrQueueQuery.isSuccess &&
      firstPendingWriteInCvrIdQuery.isSuccess &&
      !scrollIndexInitialized
    ) {
      const cvrQueue = writeInCvrQueueQuery.data;
      const firstPendingWriteInCvrId = firstPendingWriteInCvrIdQuery.data;
      if (firstPendingWriteInCvrId) {
        setScrollIndex(cvrQueue.indexOf(firstPendingWriteInCvrId));
      } else {
        setScrollIndex(0);
      }
    }
  }, [
    firstPendingWriteInCvrIdQuery,
    scrollIndexInitialized,
    writeInCvrQueueQuery,
  ]);

  // Prefetch the next and previous ballot images
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  useEffect(() => {
    if (!writeInCvrQueueQuery.isSuccess || !scrollIndexInitialized) return;

    function prefetch(cvrId: Id) {
      void queryClient.prefetchQuery({
        queryKey: getCvrWriteInImageViews.queryKey({ cvrId, contestId }),
        queryFn: () =>
          apiClient.getCvrContestWriteInImageViews({ cvrId, contestId }),
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
    contestId,
    queryClient,
    scrollIndex,
    scrollIndexInitialized,
    writeInCvrQueueQuery,
  ]);

  const candidateListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (hasPageLoaded && candidateListRef.current) {
      candidateListRef.current.scrollTop =
        candidateListRef.current.scrollHeight;
    }
  }, [hasPageLoaded]);

  if (
    !scrollIndexInitialized ||
    !voteStateInitialized ||
    (!hasPageLoaded &&
      (!firstPendingWriteInCvrIdQuery.isSuccess ||
        !writeInCvrQueueQuery.isSuccess ||
        !cvrContestWriteInImagesQuery.isSuccess ||
        !cvrContestWriteInsQuery.isSuccess ||
        !contestWriteInCandidatesQuery.isSuccess))
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
          {isFocusedWriteInHmpb ? (
            <BallotZoomImageViewer
              key={currentCvrId} // Reset zoom state for each write-in
              imageUrl={firstWriteInImage.imageUrl}
              ballotBounds={firstWriteInImage.ballotCoordinates}
              zoomedInBounds={
                focusedWriteInImage &&
                'writeInCoordinates' in focusedWriteInImage
                  ? focusedWriteInImage.writeInCoordinates
                  : firstWriteInImage.contestCoordinates
              }
            />
          ) : isFocusedWriteInBmd ? (
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
          {focusedOptionId && (
            <PanelOverlay onClick={() => setFocusedOptionId('')} />
          )}
          <Row style={{ marginTop: '0' }}>
            <ContestInfo>
              <StyledH2>{getContestDistrictName(election, contest)}</StyledH2>
              <H3 as="h1" style={{ margin: 0 }}>
                <Font weight="bold">{contest.title} </Font>
                <Font weight="regular">Adjudication</Font>
              </H3>
              <StyledH2>Vote for {seatCount}</StyledH2>
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
          <CandidateButtonList ref={candidateListRef}>
            {officialCandidates.map((candidate) => (
              <CandidateButton
                key={candidate.id + currentCvrId}
                candidate={candidate}
                isSelected={voteState[candidate.id]}
                onSelect={() => toggleVote(candidate.id)}
                onDeselect={() => toggleVote(candidate.id)}
              />
            ))}
            {Array.from({ length: seatCount }).map((_, idx) => {
              const optionId = `write-in-${idx}`;
              const isSelected = voteState[optionId];
              const isUnmarkedPendingWriteIn =
                !isSelected && writeInState[optionId] === '';
              const isFocused = focusedOptionId === optionId;
              if (isSelected || isUnmarkedPendingWriteIn) {
                return (
                  <WriteInAdjudicationButton
                    isSelected={isSelected}
                    key={optionId}
                    isFocused={isFocused}
                    cvrId={currentCvrId || ''}
                    toggleVote={() => {
                      // previously was marked
                      if (voteState[optionId]) {
                        adjudicateWriteInAsInvalid(optionId);
                      } else if (writeInState[optionId] === 'invalid') {
                        // Previously was adjudicated as invalid, thus not marked
                        // If it was invalid, reset state. Otherwise, maintain the previous state
                        resetWriteInAdjudication(optionId);
                        toggleVote(optionId);
                      }
                    }}
                    value={writeInState[optionId]}
                    onInputFocus={() => setFocusedOptionId(optionId)}
                    onInputBlur={() => setFocusedOptionId('')}
                    onChange={async (selectedIdOrNewVal) => {
                      if (!selectedIdOrNewVal) {
                        resetWriteInAdjudication(optionId);
                        setFocusedOptionId('');
                        return;
                      }

                      if (selectedIdOrNewVal === 'invalid') {
                        adjudicateWriteInAsInvalid(optionId);
                        setFocusedOptionId('');
                        return;
                      }

                      // Official candidate
                      if (officialCandidateIds.includes(selectedIdOrNewVal)) {
                        const selectedId = selectedIdOrNewVal;
                        const candidate = officialCandidates.find(
                          (item) => item.id === selectedId
                        );
                        assert(candidate !== undefined);
                        adjudicateAsOfficialCandidate(
                          candidate,
                          focusedOptionId
                        );
                        if (!isSelected) {
                          toggleVote(optionId);
                        }
                        setFocusedOptionId('');

                        return;
                      }

                      // Existing write-in candidate
                      if (writeInCandidateIds.includes(selectedIdOrNewVal)) {
                        const selectedId = selectedIdOrNewVal;
                        const candidate = writeInCandidates?.find(
                          (item) => item.id === selectedId
                        );
                        assert(candidate !== undefined);
                        adjudicateAsWriteInCandidate(
                          candidate,
                          focusedOptionId
                        );
                        if (!isSelected) {
                          toggleVote(optionId);
                        }
                        setFocusedOptionId('');

                        return;
                      }

                      // New write-in candidate
                      const newName = selectedIdOrNewVal;
                      await createAndAdjudicateWriteInCandidate(
                        newName,
                        optionId
                      );
                      if (!isSelected) {
                        toggleVote(optionId);
                      }
                      setFocusedOptionId('');
                    }}
                    officialCandidates={officialCandidates.filter(
                      (candidate) => !voteState[candidate.id]
                    )}
                    writeInCandidates={writeInCandidates || []}
                  />
                );
              }
              return (
                <CandidateButton
                  key={optionId + currentCvrId}
                  candidate={{
                    id: optionId,
                    name: 'Write-in',
                  }}
                  isSelected={false}
                  onSelect={() => {
                    toggleVote(optionId);
                    if (!(optionId in writeInState)) {
                      addWriteInRecord(optionId);
                    } else if (writeInState[optionId] === 'invalid') {
                      resetWriteInAdjudication(optionId);
                    }
                  }}
                  onDeselect={() => undefined} // Cannot be Deselected as it only shows if not selected
                />
              );
            })}
          </CandidateButtonList>
        </AdjudicationPanel>
      </Main>
    </Screen>
  );
}
