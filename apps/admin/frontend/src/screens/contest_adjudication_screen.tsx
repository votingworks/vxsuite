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
import type { WriteInRecord } from '@votingworks/admin-backend';
import { useHistory, useParams } from 'react-router-dom';
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
const MAX_TITLE_LENGTH = 25;
const MAX_DISTRICT_LENGTH = 30;

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
  align-items: start;
  height: 4rem;

  button {
    font-weight: 600;
    flex-wrap: nowrap;
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

function renderCandidateButtonCaption(
  originalVote: boolean,
  newVote: boolean,
  existingWriteInRecord?: WriteInRecord,
  writeInVal?: string
) {
  if (originalVote === newVote) {
    if (
      existingWriteInRecord?.isUnmarked &&
      !existingWriteInRecord?.isManuallyCreated &&
      writeInVal === 'invalid'
    ) {
      return (
        <CandidateButtonCaption>
          Adjudicated <Font weight="semiBold">Unmarked Write-in </Font> as
          <Font weight="semiBold"> Unmarked</Font>
        </CandidateButtonCaption>
      );
    }
    return null;
  }
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

  const [shouldAutoscrollUser, setShouldAutoscrollUser] = useState(false);
  const [scrollIndex, setScrollIndex] = useState<number | undefined>(undefined);
  const [focusedOptionId, setFocusedOptionId] = useState<string>('');
  const history = useHistory();
  const scrollStateInitialized = scrollIndex !== undefined;
  const currentCvrId = scrollStateInitialized
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
  const [isStateStale, setIsStateStale] = useState(true);
  const voteStateInitialized = Object.keys(voteState).length > 0;

  const officialCandidates = contest.candidates.filter((c) => !c.isWriteIn);
  const officialCandidateIds = officialCandidates.map((item) => item.id);
  const writeInCandidates = contestWriteInCandidatesQuery.data;
  const writeInCandidateIds = writeInCandidates?.map((item) => item.id) || [];
  const selectedCandidateIds = Object.entries(voteState)
    .filter(([, hasVote]) => hasVote)
    .map(([optionId]) => writeInState[optionId] ?? optionId);

  const seatCount = contest.seats;
  const voteCount = Object.values(voteState).filter(Boolean).length;
  const isOvervote = voteCount > seatCount;

  const numPendingWriteIns = (function () {
    let pending = 0;
    for (let i = 0; i < seatCount; i += 1) {
      const optionId = `write-in-${i}`;
      if (voteState[optionId] && !writeInState[optionId]) pending += 1;
    }
    return pending;
  })();
  const allWriteInsAdjudicated = numPendingWriteIns === 0;

  const disallowedWriteInCandidateNames = [
    '',
    ...officialCandidates.map((c) => normalizeWriteInName(c.name)),
    ...(writeInCandidates?.map((c) => normalizeWriteInName(c.name)) || []),
  ];

  let districtString = getContestDistrictName(election, contest).repeat(3);
  if (districtString.length > MAX_DISTRICT_LENGTH) {
    districtString = `${districtString.substring(0, MAX_DISTRICT_LENGTH)  }...`;
  }
  let contestString = contest.title.repeat(100);
  if (contestString.length > MAX_TITLE_LENGTH) {
    contestString = `${contestString.substring(0, MAX_TITLE_LENGTH)  }...`;
  }

  // Adjudication controls
  function setVote(id: string, isVote: boolean) {
    setVoteState((prev) => ({
      ...prev,
      [id]: isVote,
    }));
  }

  function updateWriteInState(optionId: string, newVal: string) {
    setWriteInState((prev) => ({
      ...prev,
      [optionId]: newVal,
    }));
  }

  async function addWriteInRecord(optionId: string): Promise<string> {
    // Don't add new write in record if one already exists
    assert(writeIns !== undefined);
    const existingRecord = writeIns.find((item) => item.optionId === optionId);
    if (existingRecord) return existingRecord.id;
    assert(currentCvrId !== undefined);
    const id = await addWriteInMutation.mutateAsync({
      contestId,
      optionId,
      cvrId: currentCvrId,
      name: '',
      side: undefined, // NEED to add
      isUnmarked: true, // NEED to confirm
    });
    return id;
  }

  async function adjudicateAsOfficialCandidate(
    officialCandidate: Candidate,
    optionId: string
  ): Promise<void> {
    assert(writeIns !== undefined);
    let writeInId = writeIns.find((item) => item.optionId === optionId)?.id;
    if (!writeInId) {
      writeInId = await addWriteInRecord(optionId);
    }
    adjudicateWriteInMutation.mutate({
      writeInId,
      type: 'official-candidate',
      candidateId: officialCandidate.id,
    });
  }

  async function adjudicateAsWriteInCandidate(
    writeInCandidate: Candidate,
    optionId: string
  ): Promise<void> {
    assert(writeIns !== undefined);
    let writeInId = writeIns.find((item) => item.optionId === optionId)?.id;
    if (!writeInId) {
      writeInId = await addWriteInRecord(optionId);
    }
    adjudicateWriteInMutation.mutate({
      writeInId,
      type: 'write-in-candidate',
      candidateId: writeInCandidate.id,
    });
  }

  async function createAndAdjudicateWriteInCandidate(
    name: string,
    optionId: string
  ) {
    const normalizedName = normalizeWriteInName(name);
    if (
      !normalizedName ||
      disallowedWriteInCandidateNames.includes(normalizedName)
    ) {
      return;
    }

    try {
      const writeInCandidate = await addWriteInCandidateMutation.mutateAsync({
        contestId: contest.id,
        name,
      });
      await adjudicateAsWriteInCandidate(writeInCandidate, optionId);
    } catch {
      // Default query client error handling
    }
  }

  function adjudicateWriteInAsInvalid(optionId: string) {
    const writeInRecord = writeIns?.find((item) => item.optionId === optionId);
    if (!writeInRecord) return;
    adjudicateWriteInMutation.mutate({
      writeInId: writeInRecord.id,
      type: 'invalid',
    });
  }

  function saveVoteAdjudication(optionId: string, isVote: boolean): void {
    if (!currentCvrId) return;
    adjudicateVoteMutation.mutate({
      cvrId: currentCvrId,
      contestId,
      optionId,
      isVote,
    });
  }

  async function saveAndNext(): Promise<void> {
    assert(originalVotes !== undefined);

    for (const [optionId, currentVote] of Object.entries(voteState)) {
      // Adjudications
      const previousAdjudication = voteAdjudications?.find(
        (adj) => adj.optionId === optionId
      );
      const originalVote = originalVotes.includes(optionId);
      const voteChanged = originalVote !== currentVote;

      if (
        (previousAdjudication && previousAdjudication.isVote !== currentVote) ||
        voteChanged
      ) {
        saveVoteAdjudication(optionId, currentVote);
      }

      // Write-ins
      const isWriteIn = optionId.startsWith('write-in');
      if (!isWriteIn) {
        continue;
      }
      const newWriteInValue = writeInState[optionId];
      const previousWriteInRecord = writeIns?.find(
        (writeIn) => writeIn.optionId === optionId
      );

      if (previousWriteInRecord && newWriteInValue === 'invalid') {
        adjudicateWriteInAsInvalid(optionId);
      } else if (officialCandidateIds.includes(newWriteInValue)) {
        const candidate = officialCandidates.find(
          (item) => item.id === newWriteInValue
        );
        assert(candidate !== undefined);
        await adjudicateAsOfficialCandidate(candidate, optionId);
      } else if (writeInCandidateIds.includes(newWriteInValue)) {
        const candidate = writeInCandidates?.find(
          (item) => item.id === newWriteInValue
        );
        assert(candidate !== undefined);
        await adjudicateAsWriteInCandidate(candidate, optionId);
      } else if (newWriteInValue && newWriteInValue !== 'invalid') {
        await createAndAdjudicateWriteInCandidate(newWriteInValue, optionId);
      }
    }

    if (onLastBallot) {
      history.push(routerPaths.writeIns);
    } else {
      assert(scrollIndex !== undefined);
      setScrollIndex(scrollIndex + 1);
      setIsStateStale(true);
    }
  }

  // Initialize vote and write-in management; reset on cvr scroll
  useEffect(() => {
    if (
      cvrVoteInfoQuery.isSuccess &&
      cvrContestWriteInsQuery.isSuccess &&
      !cvrContestWriteInsQuery.isStale &&
      contestWriteInCandidatesQuery.isSuccess &&
      !contestWriteInCandidatesQuery.isStale &&
      cvrContestVoteAdjudicationsQuery.isSuccess &&
      !cvrContestVoteAdjudicationsQuery.isStale &&
      (!voteStateInitialized || isStateStale)
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
      let areAllWriteInsAdjudicated = true;
      for (const writeIn of writeIns) {
        const { optionId } = writeIn;
        if (writeIn.status === 'pending') {
          areAllWriteInsAdjudicated = false;
          newWriteInState[optionId] = '';
          continue;
        }
        switch (writeIn.adjudicationType) {
          case 'official-candidate': {
            const candidate = officialCandidates.find(
              (c) => c.id === writeIn.candidateId
            );
            assert(candidate !== undefined);
            newWriteInState[optionId] = candidate.id;
            newVoteState[optionId] = true;
            break;
          }
          case 'write-in-candidate': {
            const candidate = writeInCandidates.find(
              (c) => c.id === writeIn.candidateId
            );
            assert(candidate !== undefined);
            newWriteInState[optionId] = candidate.id;
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

      setIsStateStale(false);
      setFocusedOptionId('');
      setVoteState(newVoteState);
      setWriteInState(newWriteInState);
      if (!areAllWriteInsAdjudicated) {
        setShouldAutoscrollUser(true);
      }
    }
  }, [
    cvrVoteInfoQuery.isSuccess,
    cvrVoteInfoQuery.isStale,
    cvrContestWriteInsQuery.isSuccess,
    cvrContestWriteInsQuery.isStale,
    contestWriteInCandidatesQuery.isSuccess,
    contestWriteInCandidatesQuery.isStale,
    cvrContestVoteAdjudicationsQuery.isSuccess,
    cvrContestVoteAdjudicationsQuery.isStale,
    officialCandidates,
    originalVotes,
    seatCount,
    isStateStale,
    voteAdjudications,
    voteStateInitialized,
    writeIns,
    writeInCandidates,
  ]);

  // Initiate cvr scrolling
  useEffect(() => {
    if (
      writeInCvrQueueQuery.isSuccess &&
      firstPendingWriteInCvrIdQuery.isSuccess &&
      !scrollStateInitialized
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
    scrollStateInitialized,
    writeInCvrQueueQuery,
  ]);

  // Scroll candidate list to write-ins if adjudications are required
  const candidateListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (shouldAutoscrollUser && candidateListRef.current) {
      candidateListRef.current.scrollTop =
        candidateListRef.current.scrollHeight;
      setShouldAutoscrollUser(false);
    }
  }, [shouldAutoscrollUser]);

  // Prefetch the next and previous ballot images
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  useEffect(() => {
    if (!writeInCvrQueueQuery.isSuccess || !scrollStateInitialized) return;
    function prefetch(cvrId: Id) {
      void queryClient.prefetchQuery({
        queryKey: getCvrWriteInImageViews.queryKey({ cvrId, contestId }),
        queryFn: () =>
          apiClient.getCvrContestWriteInImageViews({ cvrId, contestId }),
      });
    }
    const nextCvrId = writeInCvrQueueQuery.data[scrollIndex + 1];
    if (nextCvrId) {
      prefetch(nextCvrId);
    }
    const prevCvrId = writeInCvrQueueQuery.data[scrollIndex - 1];
    if (prevCvrId) {
      prefetch(prevCvrId);
    }
  }, [
    apiClient,
    contestId,
    queryClient,
    scrollIndex,
    scrollStateInitialized,
    writeInCvrQueueQuery,
  ]);

  const areQueriesLoading =
    !firstPendingWriteInCvrIdQuery.isSuccess ||
    !writeInCvrQueueQuery.isSuccess ||
    !cvrVoteInfoQuery.isSuccess ||
    !cvrContestWriteInImagesQuery.isSuccess ||
    !cvrContestWriteInsQuery.isSuccess ||
    !contestWriteInCandidatesQuery.isSuccess ||
    !cvrContestVoteAdjudicationsQuery.isSuccess;

  if (
    !(scrollStateInitialized && voteStateInitialized) ||
    (areQueriesLoading && !isStateStale)
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
              <StyledH2>{districtString}</StyledH2>
              <StyledH1>{contestString}</StyledH1>
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
            {isStateStale ? (
              <CandidateButtonList style={{ justifyContent: 'center' }}>
                <Icons.Loading />
              </CandidateButtonList>
            ) : (
              <CandidateButtonList ref={candidateListRef} key={currentCvrId}>
                {officialCandidates.map((candidate) => {
                  const originalVote =
                    originalVotes?.includes(candidate.id) || false;
                  const currentVote = voteState[candidate.id];

                  return (
                    <CandidateButton
                      key={candidate.id + currentCvrId}
                      candidate={candidate}
                      isSelected={currentVote}
                      onSelect={() => setVote(candidate.id, true)}
                      onDeselect={() => setVote(candidate.id, false)}
                      disabled={
                        !currentVote &&
                        selectedCandidateIds.includes(candidate.id)
                      }
                      caption={renderCandidateButtonCaption(
                        originalVote,
                        voteState[candidate.id]
                      )}
                    />
                  );
                })}
                {Array.from({ length: seatCount }).map((_, idx) => {
                  const optionId = `write-in-${idx}`;
                  const originalVote =
                    originalVotes?.includes(optionId) || false;
                  const existingWriteInRecord = writeIns?.find(
                    (writeIn) => writeIn.optionId === optionId
                  );

                  const isFocused = focusedOptionId === optionId;
                  const isSelected = voteState[optionId];
                  const isUnmarkedPendingWriteIn =
                    !isSelected && writeInState[optionId] === '';

                  if (isSelected || isUnmarkedPendingWriteIn) {
                    return (
                      <WriteInAdjudicationButton
                        cvrId={currentCvrId || ''}
                        key={optionId}
                        isFocused={isFocused}
                        isSelected={isSelected}
                        onInputFocus={() => setFocusedOptionId(optionId)}
                        onInputBlur={() => setFocusedOptionId('')}
                        value={writeInState[optionId]}
                        onChange={(selectedIdOrNewName) => {
                          setFocusedOptionId('');
                          updateWriteInState(
                            optionId,
                            selectedIdOrNewName || ''
                          );
                          if (!isSelected) {
                            setVote(optionId, true);
                          } else if (selectedIdOrNewName === 'invalid') {
                            updateWriteInState(optionId, 'invalid');
                            setVote(optionId, false);
                          }
                        }}
                        toggleVote={() => {
                          if (isSelected) {
                            updateWriteInState(optionId, 'invalid');
                            setVote(optionId, false);
                            if (isFocused) {
                              setFocusedOptionId('');
                            }
                          } else {
                            updateWriteInState(optionId, '');
                            setVote(optionId, true);
                          }
                        }}
                        officialCandidates={officialCandidates.filter(
                          (c) =>
                            writeInState[optionId] === c.id ||
                            !selectedCandidateIds.includes(c.id)
                        )}
                        writeInCandidates={(writeInCandidates || []).filter(
                          (c) =>
                            writeInState[optionId] === c.id ||
                            !selectedCandidateIds.includes(c.id)
                        )}
                        caption={renderCandidateButtonCaption(
                          originalVote,
                          voteState[optionId],
                          existingWriteInRecord,
                          writeInState[optionId]
                        )}
                      />
                    );
                  }
                  return (
                    <CandidateButton
                      candidate={{
                        id: optionId,
                        name: 'Write-in',
                      }}
                      isSelected={false}
                      key={optionId + currentCvrId}
                      onSelect={() => {
                        setVote(optionId, true);
                        updateWriteInState(optionId, '');
                      }}
                      onDeselect={() => undefined} // Cannot be reached
                      caption={renderCandidateButtonCaption(
                        originalVote,
                        voteState[optionId],
                        existingWriteInRecord,
                        writeInState[optionId]
                      )}
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
                    setIsStateStale(true);
                  }}
                  style={{ width: '5.5rem' }}
                >
                  Back
                </Button>
                <Button
                  disabled={onLastBallot}
                  onPress={() => {
                    setScrollIndex(scrollIndex + 1);
                    setIsStateStale(true);
                  }}
                  rightIcon="Next"
                  style={{ width: '5.5rem' }}
                >
                  Skip
                </Button>
                <Button
                  disabled={!allWriteInsAdjudicated}
                  icon="Done"
                  onPress={saveAndNext}
                  style={{ flexGrow: '1' }}
                  variant="primary"
                >
                  {onLastBallot ? 'Finish' : 'Save & Next'}
                </Button>
              </AdjudicationBallotNavigation>
            </AdjudicationBallotFooter>
          </AdjudicationBallot>
        </AdjudicationPanel>
      </Main>
    </Screen>
  );
}
