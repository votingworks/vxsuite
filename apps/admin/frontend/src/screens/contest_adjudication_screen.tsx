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
  addWriteInRecord,
  addWriteInCandidate,
  adjudicateVote,
  adjudicateWriteIn,
  getCastVoteRecordVoteInfo,
  getCvrWriteInImageViews,
  getFirstPendingWriteInCvrId,
  getWriteIns,
  getWriteInAdjudicationCvrQueue,
  getWriteInCandidates,
  getVoteAdjudications,
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
import { CandidateButton } from '../components/candidate_button';
import { normalizeWriteInName } from '../utils/write_ins';
import {
  DoubleVoteAlert,
  DoubleVoteAlertModal,
} from '../components/adjudication_double_vote_alert_modal';

interface ExistingCandidate {
  type: 'existing';
  id: string;
  name: string;
}

interface NewCandidate {
  type: 'new';
  name: string;
}

interface InvalidWriteIn {
  type: 'invalid';
}

type WriteInCandidateState =
  | ExistingCandidate
  | NewCandidate
  | InvalidWriteIn
  | undefined;

function isInvalidWriteIn(
  candidate: WriteInCandidateState
): candidate is InvalidWriteIn {
  return candidate?.type === 'invalid';
}

function isExistingCandidate(
  candidate: WriteInCandidateState
): candidate is ExistingCandidate {
  return candidate?.type === 'existing';
}

function isNewCandidate(
  candidate: WriteInCandidateState
): candidate is NewCandidate {
  return candidate?.type === 'new';
}

const DEFAULT_PADDING = '0.75rem';
const ADJUDICATION_PANEL_WIDTH = '23.5rem';

const BallotPanel = styled.div`
  background: black;
  flex: 1;
`;

const AdjudicationPanel = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: ${ADJUDICATION_PANEL_WIDTH};
  border-left: 4px solid black;
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

const BaseRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${DEFAULT_PADDING};
`;

const BallotHeader = styled(BaseRow)`
  background: ${(p) => p.theme.colors.inverseBackground};
  color: ${(p) => p.theme.colors.onInverse};
  align-items: start;

  button {
    flex-wrap: nowrap;
    font-weight: 600;
  }
`;

const BallotVoteCount = styled(BaseRow)`
  background: ${(p) => p.theme.colors.containerHigh};
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  justify-content: space-between;
`;

const BallotFooter = styled(BaseRow)`
  flex-direction: column;
  justify-content: start;
  align-items: stretch;
  gap: 0.5rem;
  background: ${(p) => p.theme.colors.container};
  border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  width: 100%;
`;

const BallotMetadata = styled(BaseRow)`
  padding: 0;
`;

const BallotNavigation = styled(BaseRow)`
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
  padding: ${DEFAULT_PADDING};
  overflow-y: scroll;
`;

const CandidateButtonCaption = styled.span`
  color: ${(p) => p.theme.colors.neutral};
  font-size: 0.75rem;
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
  isWriteInMarkedInvalid?: boolean
) {
  if (originalVote === newVote) {
    if (
      existingWriteInRecord?.isUnmarked &&
      !existingWriteInRecord?.isManuallyCreated &&
      isWriteInMarkedInvalid
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
  const cvrVoteInfoQuery = getCastVoteRecordVoteInfo.useQuery(
    { cvrId: currentCvrId || '' }, // add contestId
    !!currentCvrId // only run query when there is a valid CvrId
  );
  const cvrContestWriteInsQuery = getWriteIns.useQuery(
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

  const addWriteInRecordMutation = addWriteInRecord.useMutation();
  const addWriteInCandidateMutation = addWriteInCandidate.useMutation();
  const adjudicateWriteInMutation = adjudicateWriteIn.useMutation();
  const adjudicateVoteMutation = adjudicateVote.useMutation();

  // Vote and write-in state for adjudication management
  const numBallots = writeInCvrQueueQuery.data?.length;
  const onLastBallot = scrollIndex ? scrollIndex + 1 === numBallots : false;
  const voteAdjudications = cvrContestVoteAdjudicationsQuery.data;

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

  const cvrVoteInfo = cvrVoteInfoQuery.data;
  const originalVotes = cvrVoteInfo?.votes[contestId];

  const [voteState, setVoteState] = useState<Record<string, boolean>>({}); // candidateId/optionId to boolean hasVote
  const [writeInState, setWriteInState] = useState<
    Record<string, WriteInCandidateState> // optionId to WriteInCandidateState
  >({});
  const [isStateStale, setIsStateStale] = useState(true);
  const voteStateInitialized = Object.keys(voteState).length > 0;
  const [doubleVoteAlert, setDoubleVoteAlert] = useState<DoubleVoteAlert>();

  const officialCandidates = contest.candidates.filter((c) => !c.isWriteIn);
  const officialCandidateIds = officialCandidates.map((item) => item.id);
  const writeInCandidates = contestWriteInCandidatesQuery.data;
  const writeInCandidateIds = writeInCandidates?.map((item) => item.id) || [];

  const seatCount = contest.seats;
  const voteCount = Object.values(voteState).filter(Boolean).length;
  const isOvervote = voteCount > seatCount;

  const writeInOptionIds = Array.from({ length: seatCount }).map(
    (_, idx) => `write-in-${idx}`
  );
  const selectedCandidateIds = Object.entries(voteState)
    .filter(([, hasVote]) => hasVote)
    .map(([optionId]) => {
      const writeInEntry = writeInState[optionId];
      return writeInOptionIds.includes(optionId) &&
        isExistingCandidate(writeInEntry)
        ? writeInEntry.id
        : optionId;
    })
    .filter(Boolean);
  const numPendingWriteIns = writeInOptionIds.filter(
    (id) => voteState[id] && !writeInState[id]
  ).length;
  const allWriteInsAdjudicated = numPendingWriteIns === 0;

  // Adjudication actions
  function checkForDoubleVote(
    name: string,
    optionId: string
  ): DoubleVoteAlert | undefined {
    const normalizedName = normalizeWriteInName(name);
    let existingC = officialCandidates.find(
      (c) => normalizeWriteInName(c.name) === normalizedName
    );
    if (existingC && voteState[existingC.id]) {
      return {
        type: 'marked-official-candidate',
        name,
        optionId,
      };
    }
    // Review each write-in that has a vote and write-in entry to ensure the
    // new name doesn't match an already selected candidate name
    for (const writeInOptionId of writeInOptionIds) {
      const hasVote = voteState[writeInOptionId];
      const writeInValue = writeInState[writeInOptionId];
      if (optionId === writeInOptionId || !hasVote || !writeInValue) continue;
      switch (writeInValue.type) {
        case 'existing': {
          existingC = officialCandidates.find((c) => c.id === writeInValue.id);
          if (
            existingC &&
            normalizeWriteInName(existingC.name) === normalizedName
          ) {
            return {
              type: 'adjudicated-official-candidate',
              name,
              optionId,
            };
          }
          existingC = writeInCandidates?.find((c) => c.id === writeInValue.id);
          assert(existingC !== undefined); // Candidate must be write-in if not official
          if (normalizeWriteInName(existingC.name) === normalizedName) return {
              type: 'adjudicated-write-in-candidate',
              name,
              optionId,
            };
          break;
        }
        case 'new': {
          // User is attempting to create a second new candidate with the same name
          if (normalizedName === normalizeWriteInName(writeInValue.name)) {
            return {
              type: 'adjudicated-write-in-candidate',
              name,
              optionId,
            };
          }
          break;
        }
        case 'invalid': {
          // Shouldn't reach here since we skip write-ins without a vote
          break;
        }
        default: {
          /* istanbul ignore next - @preserve */
          throwIllegalValue(writeInValue, 'type');
        }
      }
    }
    return undefined;
  }

  function updateVote(id: string, isVote: boolean) {
    setVoteState((prev) => ({
      ...prev,
      [id]: isVote,
    }));
  }

  function updateWriteInState(
    optionId: string,
    newState: WriteInCandidateState
  ) {
    setWriteInState((prev) => ({
      ...prev,
      [optionId]: newState,
    }));
  }

  async function createWriteInRecord(optionId: string): Promise<string> {
    // Don't create new write in record if one already exists
    assert(writeIns !== undefined);
    const existingRecord = writeIns.find((item) => item.optionId === optionId);
    if (existingRecord) return existingRecord.id;
    assert(currentCvrId !== undefined);
    const id = await addWriteInRecordMutation.mutateAsync({
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
      writeInId = await createWriteInRecord(optionId);
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
      writeInId = await createWriteInRecord(optionId);
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
    assert(writeInCandidates !== undefined);
    const normalizedCandidateNames = officialCandidates
      .map((c) => normalizeWriteInName(c.name))
      .concat(writeInCandidates.map((c) => normalizeWriteInName(c.name)));

    const normalizedName = normalizeWriteInName(name);
    if (!normalizedName || normalizedCandidateNames.includes(normalizedName)) {
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
    assert(voteAdjudications !== undefined);
    assert(writeIns !== undefined);
    assert(writeInCandidates !== undefined);

    for (const [optionId, currentVote] of Object.entries(voteState)) {
      // Vote adjudications
      const previousAdjudication = voteAdjudications.find(
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
      const writeInValue = writeInState[optionId];
      if (!isWriteIn || !writeInValue) {
        continue;
      }

      switch (writeInValue.type) {
        case 'existing': {
          if (officialCandidateIds.includes(writeInValue.id)) {
            const candidate = officialCandidates.find(
              (item) => item.id === writeInValue.id
            );
            assert(candidate !== undefined);
            await adjudicateAsOfficialCandidate(candidate, optionId);
          } else if (writeInCandidateIds.includes(writeInValue.id)) {
            const candidate = writeInCandidates.find(
              (item) => item.id === writeInValue.id
            );
            assert(candidate !== undefined);
            await adjudicateAsWriteInCandidate(candidate, optionId);
          }
          break;
        }
        case 'new': {
          await createAndAdjudicateWriteInCandidate(
            writeInValue.name,
            optionId
          );
          break;
        }
        case 'invalid': {
          const previousWriteInRecord = writeIns.find(
            (writeIn) => writeIn.optionId === optionId
          );
          if (previousWriteInRecord) {
            adjudicateWriteInAsInvalid(optionId);
          }
          break;
        }
        default: {
          /* istanbul ignore next - @preserve */
          throwIllegalValue(writeInValue, 'type');
        }
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

      const newWriteInState: Record<string, WriteInCandidateState> = {};
      let areAllWriteInsAdjudicated = true;
      for (const writeIn of writeIns) {
        const { optionId } = writeIn;
        if (writeIn.status === 'pending') {
          areAllWriteInsAdjudicated = false;
          newWriteInState[optionId] = undefined;
          continue;
        }
        switch (writeIn.adjudicationType) {
          case 'official-candidate': {
            const candidate = officialCandidates.find(
              (c) => c.id === writeIn.candidateId
            );
            assert(candidate !== undefined);
            newWriteInState[optionId] = { ...candidate, type: 'existing' };
            newVoteState[optionId] = true;
            break;
          }
          case 'write-in-candidate': {
            const candidate = writeInCandidates.find(
              (c) => c.id === writeIn.candidateId
            );
            assert(candidate !== undefined);
            newWriteInState[optionId] = { ...candidate, type: 'existing' };
            newVoteState[optionId] = true;
            break;
          }
          case 'invalid': {
            newWriteInState[optionId] = { type: 'invalid' };
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
              ballotBounds={firstWriteInImage.ballotCoordinates}
              key={currentCvrId} // Reset zoom state for each write-in
              imageUrl={firstWriteInImage.imageUrl}
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
          <BallotHeader>
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
          </BallotHeader>
          <BallotVoteCount>
            <MediumText>
              Votes cast: {voteCount} of {seatCount}
            </MediumText>
            {isOvervote && (
              <Label>
                <Icons.Disabled color="danger" /> Overvote
              </Label>
            )}
          </BallotVoteCount>
          {isStateStale ? (
            <CandidateButtonList style={{ justifyContent: 'center' }}>
              <Icons.Loading />
            </CandidateButtonList>
          ) : (
            <CandidateButtonList ref={candidateListRef} key={currentCvrId}>
              {officialCandidates.map((candidate) => {
                assert(originalVotes !== undefined);
                const hasVoteOriginal = originalVotes.includes(candidate.id);
                const hasVoteCurrent = voteState[candidate.id];

                return (
                  <CandidateButton
                    key={candidate.id + currentCvrId}
                    candidate={candidate}
                    isSelected={hasVoteCurrent}
                    onSelect={() => updateVote(candidate.id, true)}
                    onDeselect={() => updateVote(candidate.id, false)}
                    disabled={
                      // Disabled when there is a write-in selection for the candidate
                      !hasVoteCurrent &&
                      selectedCandidateIds.includes(candidate.id)
                    }
                    caption={renderCandidateButtonCaption(
                      hasVoteOriginal,
                      hasVoteCurrent
                    )}
                  />
                );
              })}
              {writeInOptionIds.map((optionId) => {
                assert(originalVotes !== undefined);
                assert(writeIns !== undefined);
                const originalVote = originalVotes.includes(optionId);
                const existingWriteInRecord = writeIns.find(
                  (writeIn) => writeIn.optionId === optionId
                );

                const isFocused = focusedOptionId === optionId;
                const isSelected = voteState[optionId];

                let currentValue = '';
                const writeInEntry = writeInState[optionId];
                if (isExistingCandidate(writeInEntry)) {
                  currentValue = writeInEntry.id;
                } else if (isNewCandidate(writeInEntry)) {
                  currentValue = writeInEntry.name;
                }

                const isUnmarkedPendingWriteIn =
                  !isSelected &&
                  !currentValue &&
                  existingWriteInRecord?.isUnmarked;

                if (isSelected || isUnmarkedPendingWriteIn) {
                  return (
                    <WriteInAdjudicationButton
                      key={optionId}
                      isFocused={isFocused}
                      isSelected={isSelected}
                      hasInvalidEntry={doubleVoteAlert?.optionId === optionId}
                      onInputFocus={() => setFocusedOptionId(optionId)}
                      onInputBlur={() => setFocusedOptionId('')}
                      value={currentValue}
                      onChange={(newVal) => {
                        setFocusedOptionId('');
                        if (newVal === 'invalid') {
                          updateWriteInState(optionId, { type: 'invalid' });
                          updateVote(optionId, false);
                          return;
                        }
                        if (!newVal) {
                          updateWriteInState(optionId, undefined);
                          return;
                        }
                        const alert = checkForDoubleVote(newVal, optionId);
                        if (alert) {
                          updateWriteInState(optionId, undefined);
                          setDoubleVoteAlert(alert);
                          return;
                        }

                        // Mark unmarked write-ins
                        if (!isSelected) {
                          updateVote(optionId, true);
                        }
                        let newWriteInValue: WriteInCandidateState;
                        let c = officialCandidates.find((o) => o.id === newVal);
                        if (!c) {
                          c = writeInCandidates?.find((w) => w.id === newVal);
                        }
                        if (c) {
                          newWriteInValue = { type: 'existing', ...c };
                        } else {
                          newWriteInValue = { type: 'new', name: newVal };
                        }
                        updateWriteInState(optionId, newWriteInValue);
                      }}
                      toggleVote={() => {
                        if (isSelected) {
                          if (isFocused) {
                            setFocusedOptionId('');
                          }
                          updateVote(optionId, false);
                          updateWriteInState(optionId, { type: 'invalid' });
                        } else {
                          updateVote(optionId, true);
                          updateWriteInState(optionId, undefined);
                        }
                      }}
                      officialCandidates={officialCandidates.filter(
                        (c) =>
                          (isExistingCandidate(writeInState[optionId]) &&
                            writeInState[optionId].id === c.id) ||
                          !selectedCandidateIds.includes(c.id)
                      )}
                      writeInCandidates={(writeInCandidates || []).filter(
                        (c) =>
                          (isExistingCandidate(writeInState[optionId]) &&
                            writeInState[optionId].id === c.id) ||
                          !selectedCandidateIds.includes(c.id)
                      )}
                      caption={renderCandidateButtonCaption(
                        originalVote,
                        voteState[optionId],
                        existingWriteInRecord,
                        isInvalidWriteIn(writeInState[optionId])
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
                      updateVote(optionId, true);
                      updateWriteInState(optionId, undefined);
                    }}
                    onDeselect={() => undefined} // Cannot be reached
                    caption={renderCandidateButtonCaption(
                      originalVote,
                      voteState[optionId],
                      existingWriteInRecord,
                      isInvalidWriteIn(writeInState[optionId])
                    )}
                  />
                );
              })}
            </CandidateButtonList>
          )}
          <BallotFooter>
            <BallotMetadata>
              <SmallText>
                {scrollIndex + 1} of {numBallots}
              </SmallText>
              <SmallText>Ballot ID: {currentCvrId?.substring(0, 4)}</SmallText>
            </BallotMetadata>
            <BallotNavigation>
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
            </BallotNavigation>
          </BallotFooter>
        </AdjudicationPanel>
        {doubleVoteAlert && (
          <DoubleVoteAlertModal
            doubleVoteAlert={doubleVoteAlert}
            onClose={() => setDoubleVoteAlert(undefined)}
          />
        )}
      </Main>
    </Screen>
  );
}
