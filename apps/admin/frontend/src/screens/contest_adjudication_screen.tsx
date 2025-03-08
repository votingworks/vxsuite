import React, { useContext, useEffect, useRef, useState } from 'react';
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
  Icons,
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
  adjudicateVote,
  getVoteAdjudications,
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
  gap: 0.125rem;
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
  padding: 0.25rem 0.5rem 1rem 0.25rem;
`;

const CandidateButtonCaption = styled.span`
  font-size: 0.75rem;
  color: ${(p) => p.theme.colors.primary};
  font-weight: 700;
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

  const [hasPageLoaded, setHasPageLoaded] = useState(false);
  const [scrollIndex, setScrollIndex] = useState<number | undefined>(undefined);
  const [focusedOptionId, setFocusedOptionId] = useState<string>('');
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
  const cvrContestVoteAdjudicationsQuery = getVoteAdjudications.useQuery(
    { cvrId: currentCvrId ?? 'no-op', contestId },
    !!currentCvrId
  );

  const addWriteInMutation = addWriteIn.useMutation();
  const addWriteInCandidateMutation = addWriteInCandidate.useMutation();
  const adjudicateWriteInMutation = adjudicateWriteIn.useMutation();
  const adjudicateVoteMutation = adjudicateVote.useMutation();

  // Current cvr, write-in, and queue management

  const numBallots = writeInCvrQueueQuery.data?.length;
  const voteAdjudications = cvrContestVoteAdjudicationsQuery.data;

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

  // Initialize vote and write-in state for adjudication management
  const cvrVoteInfo = cvrVoteInfoQuery.data;
  const originalVotes = cvrVoteInfo?.votes[contestId];

  const [voteState, setVoteState] = useState<Record<string, boolean>>({}); // voteState: candidateId | writeInOptionId to boolean hasVote
  const [writeInState, setWriteInState] = useState<
    Record<string, string | 'invalid' | ''> // optionId to name OR 'invalid' OR '' (pending adjudication)
  >({});
  const [shouldResetState, setShouldResetState] = useState(true);
  const voteStateInitialized = Object.keys(voteState).length > 0;

  const officialCandidates = contest.candidates.filter((c) => !c.isWriteIn);
  const officialCandidateIds = officialCandidates.map((item) => item.id);
  const writeInCandidates = contestWriteInCandidatesQuery.data;
  const writeInCandidateIds = writeInCandidates?.map((item) => item.id) || [];
  const selectedWriteInCandidateNames = Object.entries(voteState)
    .filter(([optionId, hasVote]) => optionId.startsWith('write-in') && hasVote)
    .map(([optionId]) => writeInState[optionId].toLowerCase());

  const seatCount = contest.seats;
  const voteCount = Object.values(voteState).filter(Boolean).length;
  const isOvervote = voteCount > seatCount;

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

  function saveVote(optionId: string, isVote: boolean): void {
    if (!currentCvrId) return;
    if (optionId.startsWith('write-in')) return;
    adjudicateVoteMutation.mutate({
      cvrId: currentCvrId,
      contestId,
      optionId,
      isVote,
    });
  }

  function setVote(id: string, isVote: boolean, persist = true) {
    setVoteState((prev) => ({
      ...prev,
      [id]: isVote,
    }));

    if (persist) saveVote(id, isVote);
  }

  function updateWriteInState(optionId: string, newVal: string) {
    setWriteInState((prev) => ({
      ...prev,
      [optionId]: newVal,
    }));
  }

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
    setVote(optionId, false);
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
      (!voteStateInitialized || shouldResetState)
    ) {
      if (
        !originalVotes ||
        !writeIns ||
        !writeInCandidates ||
        !voteAdjudications
      ) {
        return;
      }

      const newVoteState: Record<string, boolean> = {};
      for (const c of officialCandidates) {
        newVoteState[c.id] = originalVotes.includes(c.id);
      }
      for (let i = 0; i < seatCount; i += 1) {
        const optionId = `write-in-${i}`;
        newVoteState[optionId] = originalVotes.includes(optionId);
      }
      for (const adjudication of voteAdjudications) {
        newVoteState[adjudication.optionId] = adjudication.isVote;
      }

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
      setFocusedOptionId('');
      setShouldResetState(false);
    }
  }, [
    cvrVoteInfoQuery.isSuccess,
    cvrContestWriteInsQuery.isSuccess,
    contestWriteInCandidatesQuery.isSuccess,
    officialCandidates,
    originalVotes,
    seatCount,
    shouldResetState,
    voteAdjudications,
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
        !contestWriteInCandidatesQuery.isSuccess ||
        !cvrContestVoteAdjudicationsQuery.isSuccess))
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
                  setShouldResetState(true);
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
                  setShouldResetState(true);
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
                disabled={!allWriteInsAdjudicated}
              >
                Finish
              </LinkButton>
            ) : (
              <Button
                onPress={() => {
                  setScrollIndex(scrollIndex + 1);
                  setShouldResetState(true);
                }}
                icon="Done"
                variant={allWriteInsAdjudicated ? 'primary' : 'neutral'}
                disabled={!allWriteInsAdjudicated}
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
          <Row
            style={{
              marginTop: '0',
              paddingBottom: '1rem',
              alignItems: 'center',
              borderBottom: '1px solid',
            }}
          >
            <ContestInfo>
              <StyledH2>{getContestDistrictName(election, contest)}</StyledH2>
              <H3 as="h1" style={{ margin: 0 }}>
                <Font weight="bold">
                  {contest.title.replace('Reprsentatives', 'Representatives')}
                </Font>
              </H3>
              {/* <StyledH2>Ballot Adjudication</StyledH2> */}
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
            <StyledH2 style={{ alignSelf: 'end' }}>Votes cast</StyledH2>
            <StyledP style={{ marginRight: '0.75rem' }}>
              {isOvervote ? (
                <React.Fragment>
                  {voteCount}/{seatCount} (Overvote)
                  <Icons.Warning
                    color="warning"
                    style={{ marginLeft: '0.25rem' }}
                  />
                </React.Fragment>
              ) : (
                <React.Fragment>
                  {voteCount}/{seatCount}
                  <Icons.Done
                    color="success"
                    style={{ marginLeft: '0.25rem' }}
                  />
                </React.Fragment>
              )}
            </StyledP>
          </Row>
          <Row
            style={{
              paddingBottom: '1rem',
              alignItems: 'center',
              borderBottom: '1px solid',
            }}
          >
            <StyledH2 style={{ alignSelf: 'end' }}>
              Write-ins adjudicated
            </StyledH2>
            <StyledP style={{ marginRight: '0.75rem' }}>
              {numAdjudicatedWriteIns}/{numWriteIns}
              {numAdjudicatedWriteIns !== numWriteIns ? (
                <Icons.Warning
                  color="warning"
                  style={{ marginLeft: '0.25rem' }}
                />
              ) : (
                <Icons.Done color="success" style={{ marginLeft: '0.25rem' }} />
              )}
            </StyledP>
          </Row>
          <CandidateButtonList ref={candidateListRef}>
            {officialCandidates.map((candidate) => {
              const originalVote = originalVotes?.includes(candidate.id);
              const voteChanged = voteState[candidate.id] !== originalVote;
              const originalVoteString = originalVote ? 'Marked' : 'Unmarked';
              const newVoteString = voteState[candidate.id]
                ? 'Marked'
                : 'Unmarked';

              return (
                <CandidateButton
                  key={candidate.id + currentCvrId}
                  candidate={candidate}
                  isSelected={voteState[candidate.id]}
                  onSelect={() => setVote(candidate.id, true)}
                  onDeselect={() => setVote(candidate.id, false)}
                  caption={
                    voteChanged ? (
                      <CandidateButtonCaption>
                        Adjudicated from {`${originalVoteString}`} to
                        {` ${newVoteString}`}
                      </CandidateButtonCaption>
                    ) : undefined
                  }
                />
              );
            })}
            {Array.from({ length: seatCount }).map((_, idx) => {
              const optionId = `write-in-${idx}`;
              const isSelected = voteState[optionId];
              const isUnmarkedPendingWriteIn =
                !isSelected && writeInState[optionId] === '';
              const isFocused = focusedOptionId === optionId;
              const originalVote = originalVotes?.includes(optionId);
              const voteChanged = voteState[optionId] !== originalVote;
              const originalVoteString = originalVote ? 'Marked' : 'Unmarked';
              const newVoteString = voteState[optionId] ? 'Marked' : 'Unmarked';
              if (isSelected || isUnmarkedPendingWriteIn) {
                return (
                  <WriteInAdjudicationButton
                    caption={
                      voteChanged ? (
                        <CandidateButtonCaption>
                          Adjudicated from {`${originalVoteString}`} to
                          {` ${newVoteString}`}
                        </CandidateButtonCaption>
                      ) : undefined
                    }
                    isSelected={isSelected}
                    key={optionId}
                    isFocused={isFocused}
                    cvrId={currentCvrId || ''}
                    toggleVote={() => {
                      // previously was marked
                      if (voteState[optionId]) {
                        adjudicateWriteInAsInvalid(optionId);
                      } else {
                        // Previously was adjudicated as invalid, thus not marked
                        // If it was invalid, reset state. Otherwise, maintain the previous state
                        if (writeInState[optionId] === 'invalid') {
                          resetWriteInAdjudication(optionId);
                        }
                        setVote(optionId, true);
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
                        setVote(optionId, true);
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
                        setVote(optionId, true);
                        setFocusedOptionId('');
                        return;
                      }

                      // New write-in candidate
                      const newName = selectedIdOrNewVal;
                      await createAndAdjudicateWriteInCandidate(
                        newName,
                        optionId
                      );
                      setVote(optionId, true);
                      setFocusedOptionId('');
                    }}
                    officialCandidates={officialCandidates.filter(
                      (candidate) => !voteState[candidate.id]
                    )}
                    writeInCandidates={(writeInCandidates || []).filter(
                      (c) =>
                        !selectedWriteInCandidateNames.includes(
                          c.name.toLowerCase()
                        )
                    )}
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
                    setVote(optionId, true);
                    if (!(optionId in writeInState)) {
                      addWriteInRecord(optionId);
                    } else if (writeInState[optionId] === 'invalid') {
                      resetWriteInAdjudication(optionId);
                    }
                  }}
                  onDeselect={() => undefined} // Cannot be Deselected as it only shows if not selected
                  caption={
                    voteChanged ? (
                      <CandidateButtonCaption>
                        Adjudicated from {`${originalVoteString}`} to
                        {` ${newVoteString}`}
                      </CandidateButtonCaption>
                    ) : undefined
                  }
                />
              );
            })}
          </CandidateButtonList>
        </AdjudicationPanel>
      </Main>
    </Screen>
  );
}
