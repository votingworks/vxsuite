import { useContext, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import {
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
  adjudicateWriteIn as adjudicateWriteInApi,
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

interface ExistingOfficialCandidate {
  type: 'existing-official';
  id: string;
  name: string;
}

interface ExistingWriteInCandidate {
  type: 'existing-write-in';
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

interface PendingWriteIn {
  type: 'pending';
}

type WriteInOptionState =
  | ExistingOfficialCandidate
  | ExistingWriteInCandidate
  | NewCandidate
  | InvalidWriteIn
  | PendingWriteIn
  | undefined;

function isExistingCandidate(
  candidate?: WriteInOptionState
): candidate is ExistingOfficialCandidate | ExistingWriteInCandidate {
  return (
    candidate?.type === 'existing-official' ||
    candidate?.type === 'existing-write-in'
  );
}

function isNewCandidate(
  candidate?: WriteInOptionState
): candidate is NewCandidate {
  return candidate?.type === 'new';
}

function isInvalidWriteIn(
  candidate?: WriteInOptionState
): candidate is InvalidWriteIn {
  return candidate?.type === 'invalid';
}

function isPendingWriteIn(
  candidate: WriteInOptionState
): candidate is PendingWriteIn {
  return candidate?.type === 'pending';
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
  z-index: 5;
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

function renderCandidateButtonCaption({
  originalVote,
  currentVote,
  isWriteIn,
  writeInState,
  writeInRecord,
}: {
  originalVote: boolean;
  currentVote: boolean;
  isWriteIn: boolean;
  writeInState?: WriteInOptionState;
  writeInRecord?: WriteInRecord;
}) {
  let originalValueStr: string | undefined;
  let newValueStr: string | undefined;

  if (isWriteIn) {
    if (writeInRecord?.isUnmarked && isInvalidWriteIn(writeInState)) {
      originalValueStr = 'Unmarked Write-in';
      newValueStr = 'Invalid Mark';
    } else if (originalVote && isInvalidWriteIn(writeInState)) {
      originalValueStr = 'Mark';
      newValueStr = 'Invalid Mark';
    } else if ((!writeInRecord || writeInRecord?.isUnmarked) && currentVote) {
      originalValueStr = 'Unmarked Write-in';
      newValueStr = 'Valid Write-In';
    }
  } else if (originalVote !== currentVote) {
    originalValueStr = originalVote ? 'Mark' : 'Undetected Mark';
    newValueStr = currentVote ? 'Valid Mark' : 'Invalid Mark';
  }

  if (!originalValueStr || !newValueStr) {
    return null;
  }

  return (
    <CandidateButtonCaption>
      <Font weight="semiBold">{originalValueStr} </Font>adjudicated as
      <Font weight="semiBold"> {newValueStr}</Font>
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
  const numBallots = writeInCvrQueueQuery.data?.length;
  const onLastBallot = scrollIndex ? scrollIndex + 1 === numBallots : false;

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
  const adjudicateWriteInMutation = adjudicateWriteInApi.useMutation();
  const adjudicateVoteMutation = adjudicateVote.useMutation();

  // Vote and write-in state for adjudication management
  const cvrVoteInfo = cvrVoteInfoQuery.data;
  const originalVotes = cvrVoteInfo?.votes[contestId];
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

  const [voteState, setVoteState] = useState<Record<string, boolean>>({}); // optionId to boolean hasVote
  const voteStateInitialized = Object.keys(voteState).length > 0;
  const [writeInState, setWriteInState] = useState<
    Record<string, WriteInOptionState> // optionId to WriteInOptionState
  >({});
  const [isStateStale, setIsStateStale] = useState(false);
  const [doubleVoteAlert, setDoubleVoteAlert] = useState<DoubleVoteAlert>();

  const officialCandidates = contest.candidates.filter((c) => !c.isWriteIn);
  const writeInCandidates = contestWriteInCandidatesQuery.data;

  const seatCount = contest.seats;
  const voteCount = Object.values(voteState).filter(Boolean).length;
  const isOvervote = voteCount > seatCount;

  const writeInOptionIds = Array.from({ length: seatCount }).map(
    (_, idx) => `write-in-${idx}`
  );
  const selectedCandidateNames = Object.entries(voteState)
    .filter(([, hasVote]) => hasVote)
    .map(([optionId]) => {
      if (writeInOptionIds.includes(optionId)) {
        const writeInEntry = writeInState[optionId];
        assert(writeInEntry !== undefined);
        if (isExistingCandidate(writeInEntry) || isNewCandidate(writeInEntry)) {
          return writeInEntry.name;
        }
        return undefined;
      }
      const official = officialCandidates.find((c) => c.id === optionId);
      assert(official !== undefined);
      return official.name;
    })
    .filter(Boolean);
  const numPendingWriteIns = writeInOptionIds.filter((optionId) =>
    isPendingWriteIn(writeInState[optionId])
  ).length;
  const allWriteInsAdjudicated = numPendingWriteIns === 0;

  // Adjudication actions
  function checkForDoubleVote(
    name: string,
    optionId: string
  ): DoubleVoteAlert | undefined {
    const normalizedName = normalizeWriteInName(name);
    const existingC = officialCandidates.find(
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
        case 'existing-official': {
          if (normalizeWriteInName(writeInValue.name) === normalizedName) {
            return {
              type: 'adjudicated-official-candidate',
              name,
              optionId,
            };
          }
          break;
        }
        case 'existing-write-in': {
          if (normalizeWriteInName(writeInValue.name) === normalizedName) {
            return {
              type: 'adjudicated-write-in-candidate',
              name,
              optionId,
            };
          }
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
        // Can't reach 'invalid' entries since we skip write-ins without a vote
        case 'invalid':
        case 'pending': {
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

  function updateWriteInState(optionId: string, newState: WriteInOptionState) {
    setWriteInState((prev) => ({
      ...prev,
      [optionId]: newState,
    }));
  }

  async function createWriteInRecord(optionId: string): Promise<string> {
    assert(currentCvrId !== undefined);
    assert(writeIns !== undefined);
    const existingRecord = writeIns.find((item) => item.optionId === optionId);
    if (existingRecord) return existingRecord.id;
    const id = await addWriteInRecordMutation.mutateAsync({
      contestId,
      optionId,
      isUnmarked: true,
      cvrId: currentCvrId,
      name: '',
      side: undefined, // NEED to add
    });
    return id;
  }

  async function adjudicateWriteIn({
    candidateId,
    optionId,
    type,
  }: {
    candidateId: string;
    optionId: string;
    type: 'write-in-candidate' | 'official-candidate';
  }): Promise<void> {
    assert(writeIns !== undefined);
    let writeInId = writeIns.find((item) => item.optionId === optionId)?.id;
    if (!writeInId) {
      writeInId = await createWriteInRecord(optionId);
    }
    adjudicateWriteInMutation.mutate({
      candidateId,
      type,
      writeInId,
    });
  }

  async function createCandidateAndAdjudicateWriteIn({
    name,
    optionId,
  }: {
    name: string;
    optionId: string;
  }) {
    assert(writeInCandidates !== undefined);
    const normalizedCandidateNames = officialCandidates
      .concat(writeInCandidates)
      .map((c) => normalizeWriteInName(c.name));

    const normalizedName = normalizeWriteInName(name);
    if (!normalizedName || normalizedCandidateNames.includes(normalizedName)) {
      return;
    }
    try {
      const writeInCandidate = await addWriteInCandidateMutation.mutateAsync({
        contestId: contest.id,
        name,
      });
      await adjudicateWriteIn({
        candidateId: writeInCandidate.id,
        optionId,
        type: 'write-in-candidate',
      });
    } catch {
      // Default query client error handling
    }
  }

  function adjudicateWriteInAsInvalid(optionId: string) {
    assert(writeIns !== undefined);
    const writeInRecord = writeIns.find((item) => item.optionId === optionId);
    if (!writeInRecord) return;
    adjudicateWriteInMutation.mutate({
      type: 'invalid',
      writeInId: writeInRecord.id,
    });
  }

  function saveVoteAdjudication(optionId: string, isVote: boolean): void {
    assert(currentCvrId !== undefined);
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
      const voteChanged =
        (previousAdjudication && previousAdjudication.isVote !== currentVote) ||
        (!previousAdjudication && originalVote !== currentVote);

      if (voteChanged) {
        saveVoteAdjudication(optionId, currentVote);
      }

      // Write-ins
      const isWriteIn = optionId.startsWith('write-in');
      const writeInValue = writeInState[optionId];
      if (!isWriteIn || !writeInValue) {
        continue;
      }

      switch (writeInValue.type) {
        case 'existing-official': {
          await adjudicateWriteIn({
            candidateId: writeInValue.id,
            optionId,
            type: 'official-candidate',
          });
          break;
        }
        case 'existing-write-in': {
          await adjudicateWriteIn({
            candidateId: writeInValue.id,
            optionId,
            type: 'write-in-candidate',
          });
          break;
        }
        case 'new': {
          await createCandidateAndAdjudicateWriteIn({
            name: writeInValue.name,
            optionId,
          });
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
        case 'pending':
          // There will be no pending write-ins on Save
          break;
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

      const newWriteInState: Record<string, WriteInOptionState> = {};
      let areAllWriteInsAdjudicated = true;
      for (const writeIn of writeIns) {
        const { optionId } = writeIn;
        if (writeIn.status === 'pending') {
          areAllWriteInsAdjudicated = false;
          newWriteInState[optionId] = { type: 'pending' };
          continue;
        }
        switch (writeIn.adjudicationType) {
          case 'official-candidate': {
            const candidate = officialCandidates.find(
              (c) => c.id === writeIn.candidateId
            );
            assert(candidate !== undefined);
            newWriteInState[optionId] = {
              ...candidate,
              type: 'existing-official',
            };
            newVoteState[optionId] = true;
            break;
          }
          case 'write-in-candidate': {
            const candidate = writeInCandidates.find(
              (c) => c.id === writeIn.candidateId
            );
            assert(candidate !== undefined);
            newWriteInState[optionId] = {
              ...candidate,
              type: 'existing-write-in',
            };
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
                const originalVote = originalVotes.includes(candidate.id);
                const currentVote = voteState[candidate.id];
                return (
                  <CandidateButton
                    key={candidate.id + currentCvrId}
                    candidate={candidate}
                    isSelected={currentVote}
                    onSelect={() => updateVote(candidate.id, true)}
                    onDeselect={() => updateVote(candidate.id, false)}
                    disabled={
                      // Disabled when there is a write-in selection for the candidate
                      !currentVote &&
                      selectedCandidateNames.includes(candidate.name)
                    }
                    caption={renderCandidateButtonCaption({
                      originalVote,
                      currentVote,
                      isWriteIn: false,
                    })}
                  />
                );
              })}
              {writeInOptionIds.map((optionId: string) => {
                assert(originalVotes !== undefined);
                assert(writeIns !== undefined);
                assert(writeInCandidates !== undefined);
                const originalVote = originalVotes.includes(optionId);
                const writeInRecord = writeIns.find(
                  (writeIn) => writeIn.optionId === optionId
                );
                const writeInEntry = writeInState[optionId];

                const isFocused = focusedOptionId === optionId;
                const isSelected = voteState[optionId];
                const isUnmarkedPendingWriteIn =
                  writeInRecord?.isUnmarked &&
                  isPendingWriteIn(writeInEntry) &&
                  !isSelected;

                if (!isSelected && !isUnmarkedPendingWriteIn) {
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
                        updateWriteInState(optionId, {
                          type: 'pending',
                        });
                      }}
                      onDeselect={() => undefined} // Cannot be reached
                      caption={renderCandidateButtonCaption({
                        originalVote,
                        currentVote: false,
                        isWriteIn: true,
                        writeInRecord,
                        writeInState: writeInEntry,
                      })}
                    />
                  );
                }

                assert(writeInEntry !== undefined);
                let stringValue: string;
                switch (writeInEntry.type) {
                  case 'pending': {
                    stringValue = '';
                    break;
                  }
                  case 'invalid': {
                    stringValue = 'invalid';
                    break;
                  }
                  case 'new':
                  case 'existing-official':
                  case 'existing-write-in': {
                    stringValue = writeInEntry.name;
                    break;
                  }
                  default: {
                    /* istanbul ignore next - @preserve */
                    throwIllegalValue(writeInEntry, 'type');
                  }
                }

                return (
                  <WriteInAdjudicationButton
                    key={optionId}
                    isFocused={isFocused}
                    isSelected={isSelected}
                    hasInvalidEntry={doubleVoteAlert?.optionId === optionId}
                    onInputFocus={() => setFocusedOptionId(optionId)}
                    onInputBlur={() => setFocusedOptionId('')}
                    value={stringValue}
                    onChange={(newVal) => {
                      setFocusedOptionId('');
                      if (!newVal) {
                        updateWriteInState(optionId, { type: 'pending' });
                        return;
                      }
                      if (newVal === 'invalid') {
                        updateWriteInState(optionId, { type: 'invalid' });
                        if (isSelected) {
                          updateVote(optionId, false);
                        }
                        return;
                      }
                      const alert = checkForDoubleVote(newVal, optionId);
                      if (alert) {
                        updateWriteInState(optionId, { type: 'pending' });
                        setDoubleVoteAlert(alert);
                        return;
                      }

                      // Check if new value is existing candidate or new name
                      const official = officialCandidates.find(
                        (o) => o.name === newVal
                      );

                      const writeIn = official
                        ? undefined
                        : writeInCandidates?.find((w) => w.name === newVal);

                      let newWriteInState: WriteInOptionState;
                      if (official) {
                        newWriteInState = {
                          type: 'existing-official',
                          ...official,
                        };
                      } else if (writeIn) {
                        newWriteInState = {
                          type: 'existing-write-in',
                          ...writeIn,
                        };
                      } else {
                        newWriteInState = { type: 'new', name: newVal };
                      }
                      updateWriteInState(optionId, newWriteInState);
                      if (!isSelected) {
                        updateVote(optionId, true);
                      }
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
                        updateWriteInState(optionId, { type: 'pending' });
                      }
                    }}
                    officialCandidateNames={officialCandidates
                      .filter(
                        (c) =>
                          !selectedCandidateNames.includes(c.name) ||
                          (isExistingCandidate(writeInEntry) &&
                            writeInEntry.name === c.name)
                      )
                      .map((c) => c.name)}
                    writeInCandidateNames={writeInCandidates
                      .filter(
                        (c) =>
                          !selectedCandidateNames.includes(c.name) ||
                          (isExistingCandidate(writeInEntry) &&
                            writeInEntry.name === c.name)
                      )
                      .map((c) => c.name)}
                    caption={renderCandidateButtonCaption({
                      originalVote,
                      currentVote: isSelected,
                      isWriteIn: true,
                      writeInRecord,
                      writeInState: writeInEntry,
                    })}
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
