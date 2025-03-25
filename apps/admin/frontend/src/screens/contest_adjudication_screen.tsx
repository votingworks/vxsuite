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

const Row = styled.div`
  display: flex;
  padding: 0.75rem;
  justify-content: space-between;
  align-items: center;
`;

const AdjudicationPanel = styled.div`
  display: flex;
  flex-direction: column;
  width: 23.5rem;
  height: 100vh;
  margin: 0;
  border-left: 4px solid black;
  max-height: 100%;
`;

const AdjudicationPanelOverlay = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  width: 23.5rem;
  height: 100vh;
  background: rgba(0, 0, 0, 50%);
  backdrop-filter: blur(1px);
  z-index: 15;
  pointer-events: auto;
`;

const StyledSpan = styled.span`
  font-size: 0.875rem;
  font-weight: 500;
  color: ${(p) => p.theme.colors.onBackgroundMuted};
  flex-wrap: no-wrap;
`;

const OvervoteLabel = styled.span`
  font-size: 1rem;
  font-weight: 500;
  color: ${(p) => p.theme.colors.inverseBackground};
  margin-right: 0.5rem;
`;

const AdjudicationPanelHeaderRow = styled(Row)`
  background: ${(p) => p.theme.colors.inverseBackground};
  color: ${(p) => p.theme.colors.onInverse};
  z-index: 10;
  align-items: center;
  height: 4rem;

  h1 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 800;
  }

  button {
    padding: 0.5rem 1rem;
  }
`;

const DigitalBallot = styled.div`
  display: flex;
  flex-direction: column;
  background: ${(p) => p.theme.colors.background};
  height: calc(100% - 4rem);
  max-height: 100%;
`;

const DigitalBallotInfoRow = styled(Row)`
  background: ${(p) => p.theme.colors.containerHigh};
  align-items: center;
  justify-content: start;
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
`;

const DigitalBallotMetadataRow = styled(Row)`
  background: ${(p) => p.theme.colors.container};
  justify-content: space-between;
  height: 1.5rem;
  z-index: 10;
  width: 100%;
  margin-top: auto;
  padding-bottom: 0.25rem;
  border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
`;

const DigitalBallotFooterRow = styled(Row)`
  width: 100%;
  z-index: 10;
  flex-direction: column;
  background: ${(p) => p.theme.colors.container};
  justify-content: start;
  padding-top: 0.5rem;
  gap: 0.5rem;

  button {
    flex-wrap: nowrap;
  }
`;

const StyledH3 = styled.h3`
  font-size: 1.25rem;
  font-weight: 800;
  margin: 0;
  margin-bottom: 0.5rem;
`;

const StyledH4 = styled.h4`
  color: ${(p) => p.theme.colors.onInverse};
  font-size: 0.875rem;
  margin: 0;
  margin-bottom: 0.125rem;
`;

const StyledP = styled.p`
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
`;

const CandidateButtonList = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
  overflow-y: scroll;
  position: relative;
  flex-grow: 1;
  min-height: 0;
  padding: 0.75rem;
  margin-right: 0.25rem; /* space between scrollbar and container */
  background: ${(p) => p.theme.colors.background};
`;

const CandidateButtonCaption = styled.span`
  font-size: 0.75rem;
  color: ${(p) => p.theme.colors.neutral};
  margin: 0.25rem 0 0.25rem 0.125rem;
`;

function formCandidateButtonCaption(originalVote: boolean, newVote: boolean) {
  const originalVoteString = originalVote ? 'Marked' : 'Unmarked';
  const newVoteString = newVote ? 'Marked' : 'Unmarked';
  return (
    <CandidateButtonCaption>
      Adjudicated from <Font weight="semiBold">{`${originalVoteString}`}</Font>{' '}
      to
      <Font weight="semiBold">{` ${newVoteString}`}</Font>
    </CandidateButtonCaption>
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

  const writeInCvrQueueQuery = getWriteInAdjudicationCvrQueue.useQuery({
    contestId: contest.id,
  });
  const firstPendingWriteInCvrIdQuery = getFirstPendingWriteInCvrId.useQuery({
    contestId: contest.id,
  });

  const [shouldScrollUser, setShouldScrollUser] = useState(false);
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

    // don't add new write in record if one already exists
    if (writeIns?.find((item) => item.optionId === optionId)) return;

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
    setVote(optionId, false);
  }

  function resetWriteInAdjudication(optionId: string): void {
    const writeInRecord = writeIns?.find((item) => item.optionId === optionId);
    if (!writeInRecord) return;
    adjudicateWriteInMutation.mutate({
      writeInId: writeInRecord.id,
      type: 'reset',
    });
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

      if (!allWriteInsAdjudicated) {
        setShouldScrollUser(true);
      }
    }
  }, [
    allWriteInsAdjudicated,
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

  // Initiate scroll between ballots
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

  // Scroll candidate list to write-ins if adjudications are required
  const candidateListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (shouldScrollUser && candidateListRef.current) {
      candidateListRef.current.scrollTop =
        candidateListRef.current.scrollHeight;
      setShouldScrollUser(false);
    }
  }, [shouldScrollUser]);

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

  if (
    !scrollIndexInitialized ||
    (!voteStateInitialized &&
      !shouldResetState &&
      (!firstPendingWriteInCvrIdQuery.isSuccess ||
        !writeInCvrQueueQuery.isSuccess ||
        !cvrVoteInfoQuery.isSuccess ||
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
          {/* <StickyFooter>
            <Button
              icon={true ? 'ZoomOut' : 'ZoomIn'}
              onPress={() => !true}
              // color="neutral"
              // fill="tinted"
            >
              Zoom {true ? 'Out' : 'In'}
            </Button>
          </StickyFooter> */}
        </BallotPanel>
        {focusedOptionId && <AdjudicationPanelOverlay />}
        <AdjudicationPanel>
          <AdjudicationPanelHeaderRow>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <StyledH4 as="h2">
                {getContestDistrictName(election, contest)}
              </StyledH4>
              <StyledH3 as="h1">
                {contest.title.replace('Reprsentatives', 'Representatives')}
              </StyledH3>
            </div>
            {/* <H4
              as="h1"
              style={{
                fontSize: '1.125rem',
                fontWeight: 500,
              }}
            >
              Ballot Adjudication{' '}
            </H4> */}
            <LinkButton
              icon="X"
              variant="inverseNeutral"
              fill="outlined"
              to={routerPaths.writeIns}
              style={{ justifySelf: 'end', fontWeight: '600' }}
            >
              Close
            </LinkButton>
          </AdjudicationPanelHeaderRow>
          <DigitalBallot>
            {/* <DigitalBallotHeaderRow>
              <StyledH4 as="h2">
                {getContestDistrictName(election, contest)}
              </StyledH4>
              <StyledH3 as="h1">
                {contest.title.replace('Reprsentatives', 'Representatives')}
              </StyledH3>
            </DigitalBallotHeaderRow> */}
            <DigitalBallotInfoRow style={{ position: 'relative' }}>
              <StyledP style={{ alignSelf: 'end', display: 'flex' }} as="h2">
                Votes cast: {voteCount} of {seatCount}
              </StyledP>
              {isOvervote && (
                <React.Fragment>
                  <Icons.Disabled
                    color="danger"
                    style={{
                      justifySelf: 'flex-end',
                      marginLeft: 'auto',
                      marginRight: '0.25rem',
                    }}
                  />
                  <OvervoteLabel>Overvote</OvervoteLabel>
                </React.Fragment>
              )}
            </DigitalBallotInfoRow>
            {shouldResetState ? (
              <CandidateButtonList style={{ justifyContent: 'center' }}>
                <Icons.Loading />
              </CandidateButtonList>
            ) : (
              <CandidateButtonList ref={candidateListRef} key={currentCvrId}>
                {officialCandidates.map((candidate) => {
                  const originalVote =
                    originalVotes?.includes(candidate.id) || false;
                  const voteChanged = voteState[candidate.id] !== originalVote;

                  return (
                    <CandidateButton
                      key={candidate.id + currentCvrId}
                      candidate={candidate}
                      isSelected={voteState[candidate.id]}
                      onSelect={() => setVote(candidate.id, true)}
                      onDeselect={() => setVote(candidate.id, false)}
                      disabled={selectedWriteInCandidateNames.includes(
                        candidate.id
                      )}
                      caption={
                        voteChanged
                          ? formCandidateButtonCaption(
                              originalVote,
                              voteState[candidate.id]
                            )
                          : undefined
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
                  const originalVote =
                    originalVotes?.includes(optionId) || false;
                  const voteChanged = voteState[optionId] !== originalVote;
                  if (isSelected || isUnmarkedPendingWriteIn) {
                    return (
                      <WriteInAdjudicationButton
                        caption={
                          voteChanged
                            ? formCandidateButtonCaption(
                                originalVote,
                                voteState[optionId]
                              )
                            : undefined
                        }
                        cvrId={currentCvrId || ''}
                        isSelected={isSelected}
                        key={optionId}
                        isFocused={isFocused}
                        toggleVote={() => {
                          // previously was marked
                          if (voteState[optionId]) {
                            updateWriteInState(optionId, 'invalid');
                            adjudicateWriteInAsInvalid(optionId);
                          } else {
                            // Previously was adjudicated as invalid, thus not marked
                            // If it was invalid, reset state. Otherwise, maintain the previous state
                            if (writeInState[optionId] === 'invalid') {
                              updateWriteInState(optionId, '');
                              resetWriteInAdjudication(optionId);
                            }
                            setVote(optionId, true);
                          }
                        }}
                        onInputFocus={() => setFocusedOptionId(optionId)}
                        onInputBlur={() => setFocusedOptionId('')}
                        value={writeInState[optionId]}
                        officialCandidates={officialCandidates.filter(
                          (candidate) => !voteState[candidate.id]
                        )}
                        writeInCandidates={(writeInCandidates || []).filter(
                          (c) =>
                            !selectedWriteInCandidateNames.includes(
                              c.name.toLowerCase()
                            )
                        )}
                        onChange={async (selectedIdOrNewVal) => {
                          setFocusedOptionId('');
                          updateWriteInState(
                            optionId,
                            selectedIdOrNewVal || ''
                          );
                          if (!isSelected) {
                            setVote(optionId, true);
                          }

                          if (!selectedIdOrNewVal) {
                            resetWriteInAdjudication(optionId);
                            return;
                          }
                          if (selectedIdOrNewVal === 'invalid') {
                            adjudicateWriteInAsInvalid(optionId);
                            return;
                          }

                          // Official candidate
                          if (
                            officialCandidateIds.includes(selectedIdOrNewVal)
                          ) {
                            const selectedId = selectedIdOrNewVal;
                            const candidate = officialCandidates.find(
                              (item) => item.id === selectedId
                            );
                            assert(candidate !== undefined);
                            adjudicateAsOfficialCandidate(
                              candidate,
                              focusedOptionId
                            );
                          } else if (
                            // Existing write-in candidate
                            writeInCandidateIds.includes(selectedIdOrNewVal)
                          ) {
                            const selectedId = selectedIdOrNewVal;
                            const candidate = writeInCandidates?.find(
                              (item) => item.id === selectedId
                            );
                            assert(candidate !== undefined);
                            adjudicateAsWriteInCandidate(
                              candidate,
                              focusedOptionId
                            );
                          } else {
                            // New write-in candidate
                            const newName = selectedIdOrNewVal;
                            await createAndAdjudicateWriteInCandidate(
                              newName,
                              optionId
                            );
                          }
                        }}
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
                          updateWriteInState(optionId, '');
                          resetWriteInAdjudication(optionId);
                        }
                      }}
                      onDeselect={() => undefined} // Cannot be Deselected as it only shows if not selected
                      caption={
                        voteChanged
                          ? formCandidateButtonCaption(
                              originalVote,
                              voteState[optionId]
                            )
                          : undefined
                      }
                    />
                  );
                })}
              </CandidateButtonList>
            )}
            <DigitalBallotMetadataRow>
              <StyledSpan>
                {scrollIndex + 1} of {numBallots}
              </StyledSpan>
              <StyledSpan>
                Ballot ID: {currentCvrId?.substring(0, 4)}
              </StyledSpan>
            </DigitalBallotMetadataRow>
            <DigitalBallotFooterRow>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                  gap: '0.5rem',
                }}
              >
                <Button
                  disabled={scrollIndex === 0}
                  onPress={() => {
                    setScrollIndex(scrollIndex - 1);
                    setShouldResetState(true);
                  }}
                  icon="Previous"
                  fill="outlined"
                  style={{ height: '2.5rem', width: '5.5rem' }}
                >
                  Back
                </Button>
                <Button
                  style={{ height: '2.5rem', width: '5.5rem' }}
                  onPress={() => {
                    setScrollIndex(scrollIndex + 1);
                    setShouldResetState(true);
                  }}
                  rightIcon="Next"
                  disabled={scrollIndex + 1 === numBallots}
                >
                  Skip
                </Button>
                {scrollIndex + 1 === numBallots ? (
                  <LinkButton
                    variant="primary"
                    to={routerPaths.writeIns}
                    icon="Done"
                    disabled={!allWriteInsAdjudicated}
                    style={{ flexGrow: '1' }}
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
                    variant="primary"
                    disabled={!allWriteInsAdjudicated}
                    style={{ flexGrow: '1' }}
                  >
                    Save & Next
                  </Button>
                )}
              </div>
            </DigitalBallotFooterRow>
          </DigitalBallot>
        </AdjudicationPanel>
      </Main>
    </Screen>
  );
}
