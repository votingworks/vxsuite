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
  LinkButton,
  Loading,
  Icons,
  H2,
  H1,
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

const DEFAULT_PADDING = '0.75rem';
const ADJUDICATION_PANEL_WIDTH = '23.5rem';

const BallotPanel = styled.div`
  background: black;
  flex: 1;
`;

const AdjudicationPanel = styled.div`
  display: flex;
  flex-direction: column;
  border-left: 4px solid black;
  height: 100vh;
  width: ${ADJUDICATION_PANEL_WIDTH};
`;

const AdjudicationPanelOverlay = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  height: 100vh;
  width: ${ADJUDICATION_PANEL_WIDTH};
  z-index: 15;
  backdrop-filter: blur(1px);
  background: rgba(0, 0, 0, 50%);
`;

const AdjudicationBallot = styled.div`
  display: flex;
  flex-direction: column;
  background: ${(p) => p.theme.colors.background};
  height: calc(100% - 4rem);
`;

const BaseRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${DEFAULT_PADDING};
`;

const AdjudicationPanelHeader = styled(BaseRow)`
  background: ${(p) => p.theme.colors.inverseBackground};
  color: ${(p) => p.theme.colors.onInverse};
  height: 4rem;

  button {
    font-weight: 600;
  }
`;

const AdjudicationBallotVoteCount = styled(BaseRow)`
  background: ${(p) => p.theme.colors.containerHigh};
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  justify-content: space-between;
`;

const AdjudicationBallotFooter = styled(BaseRow)`
  flex-direction: column;
  justify-content: start;
  align-items: stretch;
  gap: 0.5rem;
  background: ${(p) => p.theme.colors.container};
  border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  width: 100%;
`;

const AdjudicationBallotMetadata = styled(BaseRow)`
  padding: 0;
`;

const AdjudicationBallotNavigation = styled(BaseRow)`
  gap: 0.5rem;
  padding: 0;

  button {
    flex-wrap: nowrap;
  }
`;

const CandidateButtonList = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
  background: ${(p) => p.theme.colors.background};
  flex-grow: 1;
  overflow-y: scroll;
  padding: ${DEFAULT_PADDING};
`;

const CandidateButtonCaption = styled.span`
  font-size: 0.75rem;
  color: ${(p) => p.theme.colors.neutral};
  margin: 0.25rem 0 0.25rem 0.125rem;
`;

const ContestTitleDiv = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`;

const StyledH1 = styled(H1)`
  font-size: 1.125rem;
  margin: 0;
`;

const StyledH2 = styled(H2)`
  font-size: 0.875rem;
  margin: 0;
`;

const MediumText = styled.p`
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
`;

const SmallText = styled.span`
  color: ${(p) => p.theme.colors.onBackgroundMuted};
  font-size: 0.875rem;
  font-weight: 500;
`;

const Label = styled.span`
  color: ${(p) => p.theme.colors.inverseBackground};
  font-size: 1rem;
  font-weight: 500;
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
  const onLastBallot = scrollIndex ? scrollIndex + 1 === numBallots : false;
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
          {isFocusedWriteInHmpb && (
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
          )}
          {isFocusedWriteInBmd && (
            <BallotStaticImageViewer
              key={currentCvrId}
              imageUrl={firstWriteInImage.imageUrl}
            />
          )}
        </BallotPanel>
        <AdjudicationPanel>
          {focusedOptionId && <AdjudicationPanelOverlay />}
          <AdjudicationPanelHeader>
            <ContestTitleDiv>
              <StyledH2>{getContestDistrictName(election, contest)}</StyledH2>
              <StyledH1>{contest.title}</StyledH1>
            </ContestTitleDiv>
            <LinkButton
              fill="outlined"
              icon="X"
              to={routerPaths.writeIns}
              variant="inverseNeutral"
            >
              Close
            </LinkButton>
          </AdjudicationPanelHeader>
          <AdjudicationBallot>
            <AdjudicationBallotVoteCount>
              <MediumText>
                Votes cast: {voteCount} of {seatCount}
              </MediumText>
              {isOvervote && (
                <Label>
                  <Icons.Disabled color="danger" /> Overvote
                </Label>
              )}
            </AdjudicationBallotVoteCount>
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
            <AdjudicationBallotFooter>
              <AdjudicationBallotMetadata>
                <SmallText>
                  {scrollIndex + 1} of {numBallots}
                </SmallText>
                <SmallText>
                  Ballot ID: {currentCvrId?.substring(0, 4)}
                </SmallText>
              </AdjudicationBallotMetadata>
              <AdjudicationBallotNavigation>
                <Button
                  disabled={scrollIndex === 0}
                  icon="Previous"
                  onPress={() => {
                    setScrollIndex(scrollIndex - 1);
                    setShouldResetState(true);
                  }}
                  style={{ width: '5.5rem' }}
                >
                  Back
                </Button>
                <Button
                  disabled={onLastBallot}
                  onPress={() => {
                    setScrollIndex(scrollIndex + 1);
                    setShouldResetState(true);
                  }}
                  rightIcon="Next"
                  style={{ width: '5.5rem' }}
                >
                  Skip
                </Button>
                {onLastBallot ? (
                  <LinkButton
                    disabled={!allWriteInsAdjudicated}
                    icon="Done"
                    style={{ flexGrow: '1' }}
                    to={routerPaths.writeIns}
                    variant="primary"
                  >
                    Finish
                  </LinkButton>
                ) : (
                  <Button
                    disabled={!allWriteInsAdjudicated}
                    icon="Done"
                    onPress={() => {
                      setScrollIndex(scrollIndex + 1);
                      setShouldResetState(true);
                    }}
                    style={{ flexGrow: '1' }}
                    variant="primary"
                  >
                    Save & Next
                  </Button>
                )}
              </AdjudicationBallotNavigation>
            </AdjudicationBallotFooter>
          </AdjudicationBallot>
        </AdjudicationPanel>
      </Main>
    </Screen>
  );
}
