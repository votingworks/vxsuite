import React, {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';
import {
  Candidate,
  ContestOptionId,
  getContestDistrictName,
  YesNoOption,
} from '@votingworks/types';
import {
  Button,
  Main,
  Screen,
  Font,
  Loading,
  Icons,
  H2,
  H1,
  P,
} from '@votingworks/ui';
import {
  assert,
  assertDefined,
  deepEqual,
  find,
  iter,
  throwIllegalValue,
} from '@votingworks/basics';
import type {
  AdjudicatedContestOption,
  AdjudicatedCvrContest,
  WriteInRecord,
} from '@votingworks/admin-backend';
import { allContestOptions, format } from '@votingworks/utils';
import { useHistory, useParams } from 'react-router-dom';
import {
  getCastVoteRecordVoteInfo,
  getBallotImageView,
  getNextCvrIdForAdjudication,
  getWriteIns,
  getAdjudicationQueue,
  getWriteInCandidates,
  getVoteAdjudications,
  adjudicateCvrContest,
  getMarginalMarks,
  getCvrContestTag,
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
import { ContestOptionButton } from '../components/contest_option_button';
import {
  getOptionCoordinates,
  normalizeWriteInName,
} from '../utils/adjudication';
import {
  DoubleVoteAlert,
  DoubleVoteAlertModal,
} from '../components/adjudication_double_vote_alert_modal';
import { DiscardChangesModal } from '../components/discard_changes_modal';

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

interface NewWriteInCandidate {
  type: 'new-write-in';
  name: string;
}

export interface InvalidWriteIn {
  type: 'invalid';
}

interface PendingWriteIn {
  type: 'pending';
}

export type WriteInAdjudicationStatus =
  | ExistingOfficialCandidate
  | ExistingWriteInCandidate
  | NewWriteInCandidate
  | InvalidWriteIn
  | PendingWriteIn
  | undefined;

type WriteInStatusByOptionId = Record<
  ContestOptionId,
  WriteInAdjudicationStatus
>;

type HasVoteByOptionId = Record<ContestOptionId, boolean>;

function isValidCandidate(
  status: WriteInAdjudicationStatus
): status is
  | ExistingOfficialCandidate
  | ExistingWriteInCandidate
  | NewWriteInCandidate {
  return (
    status?.type === 'existing-official' ||
    status?.type === 'existing-write-in' ||
    status?.type === 'new-write-in'
  );
}

function isOfficialCandidate(
  status: WriteInAdjudicationStatus
): status is ExistingOfficialCandidate {
  return status?.type === 'existing-official';
}

function isInvalidWriteIn(
  status: WriteInAdjudicationStatus
): status is InvalidWriteIn {
  return status?.type === 'invalid';
}

function isPendingWriteIn(
  status: WriteInAdjudicationStatus
): status is PendingWriteIn {
  return status?.type === 'pending';
}

export type MarginalMarkStatus = 'pending' | 'resolved';
type MarginalMarkStatusByOptionId = Record<ContestOptionId, MarginalMarkStatus>;

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
  min-height: 4rem;
  flex-shrink: 0;

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

  /* row-reverse allows tabbing to go from primary to secondary actions */
  flex-direction: row-reverse;

  button {
    flex-wrap: nowrap;
  }
`;

const ContestOptionButtonList = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
  background: ${(p) => p.theme.colors.background};
  flex-grow: 1;
  padding: ${DEFAULT_PADDING};
  overflow-y: scroll;
`;

const ContestOptionButtonCaption = styled.span`
  color: ${(p) => p.theme.colors.primary};
  font-size: 0.75rem;
  margin: 0.25rem 0 0.25rem 0.125rem;
`;

const ContestTitleDiv = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`;

const CompactH1 = styled(H1)`
  font-size: 1.125rem;
  margin: 0;
`;

const CompactH2 = styled(H2)`
  font-size: 0.875rem;
  margin: 0;
`;

const MediumText = styled(P)`
  font-weight: 700;
  line-height: 1;
  margin: 0;
`;

const SmallText = styled(P)`
  color: ${(p) => p.theme.colors.onBackgroundMuted};
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1;
  margin: 0;
`;

const Label = styled.span`
  color: ${(p) => p.theme.colors.inverseBackground};
  font-size: 1rem;
  font-weight: 500;
`;

const PrimaryNavButton = styled(Button)`
  flex-grow: 1;
`;

const SecondaryNavButton = styled(Button)`
  width: 5.5rem;
`;

function renderContestOptionButtonCaption({
  originalVote,
  currentVote,
  isWriteIn,
  writeInStatus,
  writeInRecord,
  marginalMarkStatus,
}: {
  originalVote: boolean;
  currentVote: boolean;
  isWriteIn: boolean;
  writeInStatus?: WriteInAdjudicationStatus;
  writeInRecord?: WriteInRecord;
  marginalMarkStatus?: MarginalMarkStatus;
}) {
  let originalValueStr: string | undefined;
  let newValueStr: string | undefined;

  if (marginalMarkStatus === 'resolved' && currentVote) {
    originalValueStr = 'Marginal Mark';
    newValueStr = isWriteIn ? 'Valid Write-in' : 'Valid Mark';
  } else if (marginalMarkStatus === 'resolved' && !currentVote) {
    originalValueStr = 'Marginal Mark';
    newValueStr = isWriteIn ? 'Invalid Write-in' : 'Invalid Mark';
  } else if (isWriteIn) {
    if (writeInRecord?.isUnmarked && isInvalidWriteIn(writeInStatus)) {
      originalValueStr = 'Unmarked Write-in';
      newValueStr = 'Invalid Mark';
    } else if (originalVote && isInvalidWriteIn(writeInStatus)) {
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
    <ContestOptionButtonCaption>
      <Font weight="semiBold">{originalValueStr} </Font>adjudicated as
      <Font weight="semiBold"> {newValueStr}</Font>
    </ContestOptionButtonCaption>
  );
}

export function ContestAdjudicationScreen(): JSX.Element {
  const history = useHistory();
  const { contestId } = useParams<ContestAdjudicationScreenParams>();
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  const contest = find(election.contests, (c) => c.id === contestId);
  const isCandidateContest = contest.type === 'candidate';

  // Queries and mutations
  const cvrQueueQuery = getAdjudicationQueue.useQuery({ contestId });
  const firstPendingCvrIdQuery = getNextCvrIdForAdjudication.useQuery({
    contestId,
  });

  const [maybeCvrQueueIndex, setMaybeCvrQueueIndex] = useState<number>();
  const isQueueReady =
    maybeCvrQueueIndex !== undefined && cvrQueueQuery.data !== undefined;
  const maybeCurrentCvrId = isQueueReady
    ? cvrQueueQuery.data[maybeCvrQueueIndex]
    : undefined;

  const cvrVoteInfoQuery = getCastVoteRecordVoteInfo.useQuery(
    maybeCurrentCvrId ? { cvrId: maybeCurrentCvrId } : undefined
  );
  const voteAdjudicationsQuery = getVoteAdjudications.useQuery(
    maybeCurrentCvrId ? { cvrId: maybeCurrentCvrId, contestId } : undefined
  );
  const writeInsQuery = getWriteIns.useQuery(
    maybeCurrentCvrId ? { cvrId: maybeCurrentCvrId, contestId } : undefined
  );
  const ballotImageViewQuery = getBallotImageView.useQuery(
    maybeCurrentCvrId ? { cvrId: maybeCurrentCvrId, contestId } : undefined
  );
  const writeInCandidatesQuery = getWriteInCandidates.useQuery({
    contestId,
  });
  const marginalMarksQuery = getMarginalMarks.useQuery(
    maybeCurrentCvrId ? { cvrId: maybeCurrentCvrId, contestId } : undefined
  );
  const cvrContestTagQuery = getCvrContestTag.useQuery(
    maybeCurrentCvrId ? { cvrId: maybeCurrentCvrId, contestId } : undefined
  );

  const adjudicateCvrContestMutation = adjudicateCvrContest.useMutation();
  const officialOptions = useMemo(
    () =>
      isCandidateContest
        ? contest.candidates.filter((c) => !c.isWriteIn)
        : [contest.yesOption, contest.noOption],
    [contest, isCandidateContest]
  );
  const writeInOptionIds = useMemo(
    () =>
      isCandidateContest
        ? iter(allContestOptions(contest))
            .filterMap((option) => (option.isWriteIn ? option.id : undefined))
            .toArray()
        : [],
    [contest, isCandidateContest]
  );
  const allOptionsIds = useMemo(
    () => [...officialOptions.map((o) => o.id), ...writeInOptionIds],
    [officialOptions, writeInOptionIds]
  );

  // Vote and write-in state for adjudication management
  const [hasVoteByOptionId, setHasVoteByOptionId] = useState<HasVoteByOptionId>(
    {}
  );
  const initialHasVoteByOptionIdRef = useRef<HasVoteByOptionId>();
  function setOptionHasVote(optionId: ContestOptionId, hasVote: boolean) {
    setHasVoteByOptionId((prev) => ({
      ...prev,
      [optionId]: hasVote,
    }));
  }
  const [writeInStatusByOptionId, setWriteInStatusByOptionId] =
    useState<WriteInStatusByOptionId>({});
  const initialWriteInStatusByOptionIdRef = useRef<WriteInStatusByOptionId>();
  function setOptionWriteInStatus(
    optionId: ContestOptionId,
    status: WriteInAdjudicationStatus
  ) {
    setWriteInStatusByOptionId((prev) => ({
      ...prev,
      [optionId]: status,
    }));
  }

  const [marginalMarkStatusByOptionId, setMarginalMarkStatusByOptionId] =
    useState<MarginalMarkStatusByOptionId>({});
  const initialMarginalMarkStatusByOptionId =
    useRef<MarginalMarkStatusByOptionId>();
  function resolveMarginalMark(optionId: ContestOptionId) {
    setMarginalMarkStatusByOptionId((prev) =>
      optionId in prev
        ? {
            ...prev,
            [optionId]: 'resolved',
          }
        : prev
    );
  }

  const isVoteStateReady = Object.keys(hasVoteByOptionId).length > 0;

  const [focusedOptionId, setFocusedOptionId] = useState<string>();
  const [shouldScrollToOption, setShouldScrollToOption] = useState(false);
  const [doubleVoteAlert, setDoubleVoteAlert] = useState<DoubleVoteAlert>();
  const [discardChangesNextAction, setDiscardChangesNextAction] = useState<
    'close' | 'back' | 'skip'
  >();

  // Initialize vote and write-in management; reset on cvr scroll
  useEffect(() => {
    if (
      cvrVoteInfoQuery.isSuccess &&
      !cvrVoteInfoQuery.isStale &&
      writeInsQuery.isSuccess &&
      !writeInsQuery.isStale &&
      writeInCandidatesQuery.isSuccess &&
      !writeInCandidatesQuery.isStale &&
      voteAdjudicationsQuery.isSuccess &&
      !voteAdjudicationsQuery.isStale &&
      marginalMarksQuery.isSuccess &&
      !marginalMarksQuery.isStale &&
      cvrContestTagQuery.isSuccess &&
      !cvrContestTagQuery.isStale
    ) {
      const originalVotes = cvrVoteInfoQuery.data.votes[contestId];
      const newHasVoteByOptionId: HasVoteByOptionId = {};
      for (const o of officialOptions) {
        newHasVoteByOptionId[o.id] = originalVotes.includes(o.id);
      }

      const newWriteInStatusByOptionId: WriteInStatusByOptionId = {};
      for (const optionId of writeInOptionIds) {
        newHasVoteByOptionId[optionId] = originalVotes.includes(optionId);
        newWriteInStatusByOptionId[optionId] = undefined;
      }
      for (const adjudication of voteAdjudicationsQuery.data) {
        newHasVoteByOptionId[adjudication.optionId] = adjudication.isVote;
      }
      const newMarginalMarkStatusByOptionId: MarginalMarkStatusByOptionId = {};
      const isContestAdjudicated = assertDefined(
        cvrContestTagQuery.data
      ).isResolved;
      for (const optionId of marginalMarksQuery.data) {
        newMarginalMarkStatusByOptionId[optionId] = isContestAdjudicated
          ? 'resolved'
          : 'pending';
      }
      for (const writeIn of writeInsQuery.data) {
        const { optionId } = writeIn;
        if (writeIn.status === 'pending') {
          newWriteInStatusByOptionId[optionId] = { type: 'pending' };
          continue;
        }
        switch (writeIn.adjudicationType) {
          case 'official-candidate': {
            const candidate = assertDefined(
              officialOptions.find((c) => c.id === writeIn.candidateId)
            ) as Candidate;
            newWriteInStatusByOptionId[optionId] = {
              ...candidate,
              type: 'existing-official',
            };
            newHasVoteByOptionId[optionId] = true;
            break;
          }
          case 'write-in-candidate': {
            const candidate = assertDefined(
              writeInCandidatesQuery.data.find(
                (c) => c.id === writeIn.candidateId
              )
            );
            newWriteInStatusByOptionId[optionId] = {
              ...candidate,
              type: 'existing-write-in',
            };
            newHasVoteByOptionId[optionId] = true;
            break;
          }
          case 'invalid': {
            newWriteInStatusByOptionId[optionId] = { type: 'invalid' };
            newHasVoteByOptionId[optionId] = false;
            break;
          }
          default: {
            /* istanbul ignore next - @preserve */
            throwIllegalValue(writeIn, 'adjudicationType');
          }
        }
      }
      setFocusedOptionId(undefined);
      setHasVoteByOptionId(newHasVoteByOptionId);
      setWriteInStatusByOptionId(newWriteInStatusByOptionId);
      setMarginalMarkStatusByOptionId(newMarginalMarkStatusByOptionId);
      initialHasVoteByOptionIdRef.current = newHasVoteByOptionId;
      initialWriteInStatusByOptionIdRef.current = newWriteInStatusByOptionId;
      initialMarginalMarkStatusByOptionId.current =
        newMarginalMarkStatusByOptionId;
      if (!isContestAdjudicated) {
        setShouldScrollToOption(true);
      }
    }
  }, [
    contestId,
    officialOptions,
    cvrVoteInfoQuery.data,
    cvrVoteInfoQuery.isStale,
    cvrVoteInfoQuery.isSuccess,
    cvrContestTagQuery.data,
    cvrContestTagQuery.isStale,
    cvrContestTagQuery.isSuccess,
    marginalMarksQuery.data,
    marginalMarksQuery.isStale,
    marginalMarksQuery.isSuccess,
    voteAdjudicationsQuery.data,
    voteAdjudicationsQuery.isStale,
    voteAdjudicationsQuery.isSuccess,
    writeInsQuery.data,
    writeInsQuery.isStale,
    writeInsQuery.isSuccess,
    writeInCandidatesQuery.data,
    writeInCandidatesQuery.isStale,
    writeInCandidatesQuery.isSuccess,
    writeInOptionIds,
  ]);

  // Open to first pending cvr when queue data is loaded
  useEffect(() => {
    if (
      maybeCvrQueueIndex === undefined &&
      cvrQueueQuery.isSuccess &&
      firstPendingCvrIdQuery.isSuccess
    ) {
      const cvrQueue = cvrQueueQuery.data;
      const cvrId = firstPendingCvrIdQuery.data;
      if (cvrId) {
        setMaybeCvrQueueIndex(cvrQueue.indexOf(cvrId));
      } else {
        setMaybeCvrQueueIndex(0);
      }
    }
  }, [firstPendingCvrIdQuery, cvrQueueQuery, maybeCvrQueueIndex]);

  // Prefetch the next and previous ballot images
  const prefetchImageViews = getBallotImageView.usePrefetch();
  useEffect(() => {
    if (!cvrQueueQuery.isSuccess || maybeCvrQueueIndex === undefined) return;
    const nextCvrId = cvrQueueQuery.data[maybeCvrQueueIndex + 1];
    if (nextCvrId) {
      void prefetchImageViews({ cvrId: nextCvrId, contestId });
    }
    const prevCvrId = cvrQueueQuery.data[maybeCvrQueueIndex - 1];
    if (prevCvrId) {
      void prefetchImageViews({ cvrId: prevCvrId, contestId });
    }
  }, [contestId, maybeCvrQueueIndex, cvrQueueQuery, prefetchImageViews]);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (focusedOptionId) {
          (document.activeElement as HTMLElement)?.blur();
          setFocusedOptionId(undefined);
        }
        setDiscardChangesNextAction(undefined);
        setDoubleVoteAlert(undefined);
      }
    }
    window.addEventListener('keydown', handleEscape, { capture: true });
    return () =>
      window.removeEventListener('keydown', handleEscape, { capture: true });
  }, [doubleVoteAlert, discardChangesNextAction, focusedOptionId]);

  // On initial load or ballot navigation, autoscroll the user after queries succeed
  const areQueriesFetching =
    cvrVoteInfoQuery.isFetching ||
    cvrQueueQuery.isFetching ||
    firstPendingCvrIdQuery.isFetching ||
    ballotImageViewQuery.isFetching ||
    writeInsQuery.isFetching ||
    writeInCandidatesQuery.isFetching ||
    voteAdjudicationsQuery.isFetching ||
    marginalMarksQuery.isFetching ||
    cvrContestTagQuery.isFetching;

  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const firstRequiringAdjudicationId = cvrContestTagQuery.data?.isResolved
    ? undefined
    : allOptionsIds.find(
        (id) =>
          marginalMarkStatusByOptionId[id] === 'pending' ||
          isPendingWriteIn(writeInStatusByOptionId[id])
      );

  useLayoutEffect(() => {
    if (
      !areQueriesFetching &&
      firstRequiringAdjudicationId &&
      shouldScrollToOption
    ) {
      const index = allOptionsIds.findIndex(
        (id) => id === firstRequiringAdjudicationId
      );
      const el = optionRefs.current[index];
      if (el) {
        el.scrollIntoView({
          behavior: 'instant',
          block: 'start',
        });
      }
      setShouldScrollToOption(false);
    }
  }, [
    allOptionsIds,
    areQueriesFetching,
    firstRequiringAdjudicationId,
    shouldScrollToOption,
  ]);

  // Only show full loading screen on initial load to mitigate screen flicker on scroll
  if (
    !isQueueReady ||
    !maybeCurrentCvrId ||
    !cvrVoteInfoQuery.data ||
    !writeInCandidatesQuery.data ||
    !writeInsQuery.data ||
    !voteAdjudicationsQuery.data ||
    !ballotImageViewQuery.data ||
    !marginalMarksQuery.data ||
    !cvrContestTagQuery.data
  ) {
    return (
      <NavigationScreen title="Contest Adjudication">
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  const originalVotes = cvrVoteInfoQuery.data.votes[contestId];
  const writeIns = writeInsQuery.data;
  const ballotImage = ballotImageViewQuery.data;
  const writeInCandidates = writeInCandidatesQuery.data;
  const cvrQueueIndex = maybeCvrQueueIndex;
  const currentCvrId = maybeCurrentCvrId;

  const voteCount = Object.values(hasVoteByOptionId).filter(Boolean).length;
  const seatCount = isCandidateContest ? contest.seats : 1;
  const isOvervote = voteCount > seatCount;
  const numPendingWriteIns = iter(writeInOptionIds)
    .filter((optionId) => isPendingWriteIn(writeInStatusByOptionId[optionId]))
    .count();
  const allWriteInsAdjudicated = numPendingWriteIns === 0;
  const allMarginalMarksAdjudicated = !Object.values(
    marginalMarkStatusByOptionId
  ).some((status) => status !== 'resolved');

  const isHmpb = ballotImage.type === 'hmpb';
  const isBmd = ballotImage.type === 'bmd';
  const { side } = ballotImage;
  const focusedCoordinates =
    focusedOptionId && isHmpb
      ? getOptionCoordinates(ballotImage.optionLayouts, focusedOptionId)
      : undefined;

  const selectedCandidateNames = isCandidateContest
    ? Object.entries(hasVoteByOptionId)
        .filter(([, hasVote]) => hasVote)
        .map(([optionId]) => {
          if (writeInOptionIds.includes(optionId)) {
            const writeInStatus = writeInStatusByOptionId[optionId];
            if (isValidCandidate(writeInStatus)) {
              return writeInStatus.name;
            }
            // Pending write-in so there is no name yet
            return undefined;
          }
          // Must be official candidate
          const official = assertDefined(
            officialOptions.find((c) => c.id === optionId)
          ) as Candidate;
          return official.name;
        })
        .filter(Boolean)
    : [];

  function checkForDoubleVote({
    name,
    optionId,
  }: {
    name: string;
    optionId: ContestOptionId;
  }): DoubleVoteAlert | undefined {
    const normalizedName = normalizeWriteInName(name);
    const existingCandidate = (officialOptions as Candidate[]).find(
      (c) => normalizeWriteInName(c.name) === normalizedName
    );
    if (existingCandidate && hasVoteByOptionId[existingCandidate.id]) {
      return {
        type: 'marked-official-candidate',
        name,
        optionId,
      };
    }
    const match = writeInOptionIds
      .filter((id) => id !== optionId && hasVoteByOptionId[id])
      .map((id) => writeInStatusByOptionId[id])
      .filter((status) => isValidCandidate(status))
      .find((status) => normalizeWriteInName(status.name) === normalizedName);
    if (match) {
      return {
        type: isOfficialCandidate(match)
          ? 'adjudicated-official-candidate'
          : 'adjudicated-write-in-candidate',
        name,
        optionId,
      };
    }
    return undefined;
  }

  const numBallots = cvrQueueQuery.data.length;
  const onFirstBallot = cvrQueueIndex === 0;
  const onLastBallot = cvrQueueIndex + 1 === numBallots;

  const isModified =
    !deepEqual(hasVoteByOptionId, initialHasVoteByOptionIdRef.current) ||
    !deepEqual(
      writeInStatusByOptionId,
      initialWriteInStatusByOptionIdRef.current
    ) ||
    !deepEqual(
      marginalMarkStatusByOptionId,
      initialMarginalMarkStatusByOptionId.current
    );

  function clearBallotState(): void {
    setHasVoteByOptionId({});
    setWriteInStatusByOptionId({});
    setMarginalMarkStatusByOptionId({});
    setDiscardChangesNextAction(undefined);
    setFocusedOptionId(undefined);
    setDoubleVoteAlert(undefined);
  }

  async function saveAndNext(): Promise<void> {
    const adjudicatedContestOptionById: Record<
      ContestOptionId,
      AdjudicatedContestOption
    > = {};
    const adjudicatedCvrContest: AdjudicatedCvrContest = {
      adjudicatedContestOptionById,
      contestId,
      cvrId: currentCvrId,
      side,
    };
    const officialOptionIds = officialOptions.map((o) => o.id);
    for (const optionId of officialOptionIds) {
      const hasVote = hasVoteByOptionId[optionId];
      adjudicatedContestOptionById[optionId] = {
        type: 'candidate-option',
        hasVote,
      };
    }
    for (const optionId of writeInOptionIds) {
      const writeInStatus = writeInStatusByOptionId[optionId];
      // throw error if there is a pending write-in
      assert(!isPendingWriteIn(writeInStatus));
      if (isInvalidWriteIn(writeInStatus) || !writeInStatus) {
        adjudicatedContestOptionById[optionId] = {
          type: 'write-in-option',
          hasVote: false,
        };
      } else if (isOfficialCandidate(writeInStatus)) {
        adjudicatedContestOptionById[optionId] = {
          type: 'write-in-option',
          hasVote: true,
          candidateType: 'official-candidate',
          candidateId: writeInStatus.id,
        };
      } else {
        adjudicatedContestOptionById[optionId] = {
          type: 'write-in-option',
          hasVote: true,
          candidateType: 'write-in-candidate',
          candidateName: writeInStatus.name,
        };
      }
    }
    try {
      await adjudicateCvrContestMutation.mutateAsync(adjudicatedCvrContest);
      if (onLastBallot) {
        history.push(routerPaths.adjudication);
      } else {
        setMaybeCvrQueueIndex(cvrQueueIndex + 1);
        clearBallotState();
      }
    } catch {
      // Handled by default query client error handling
    }
  }

  function onSkip(): void {
    if (onLastBallot) return;
    if (isModified && !discardChangesNextAction) {
      setDiscardChangesNextAction('skip');
      return;
    }
    setMaybeCvrQueueIndex(cvrQueueIndex + 1);
    clearBallotState();
  }

  function onBack(): void {
    if (onFirstBallot) return;
    if (isModified && !discardChangesNextAction) {
      setDiscardChangesNextAction('back');
      return;
    }
    setMaybeCvrQueueIndex(cvrQueueIndex - 1);
    clearBallotState();
  }

  function onClose(): void {
    if (isModified && !discardChangesNextAction) {
      setDiscardChangesNextAction('close');
      return;
    }
    history.push(routerPaths.adjudication);
  }

  function handleListboxKeyDown(e: React.KeyboardEvent) {
    const activeElement = document.activeElement as HTMLElement | null;
    const activeIndex = optionRefs.current.findIndex(
      (el) => el === activeElement
    );

    if (activeIndex === -1) return;

    function moveFocus(index: number) {
      optionRefs.current[index]?.focus();
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveFocus((activeIndex + 1) % optionRefs.current.length);
        break;

      case 'ArrowUp':
        e.preventDefault();
        moveFocus(
          (activeIndex - 1 + optionRefs.current.length) %
            optionRefs.current.length
        );
        break;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const optionId = activeElement?.dataset['optionId'];
        if (optionId) {
          const hasVote = hasVoteByOptionId[optionId];
          setOptionHasVote(optionId, !hasVote);
          resolveMarginalMark(optionId);
          if (optionId.startsWith('write-in')) {
            setOptionWriteInStatus(
              optionId,
              hasVote ? { type: 'invalid' } : { type: 'pending' }
            );
          }
        }
        break;
      }
      default: // no-op
    }
  }

  return (
    <Screen>
      <Main flexRow data-testid={`transcribe:${currentCvrId}`}>
        <BallotPanel>
          {isHmpb && (
            <BallotZoomImageViewer
              ballotBounds={ballotImage.ballotCoordinates}
              key={currentCvrId} // Reset zoom state for each write-in
              imageUrl={ballotImage.imageUrl}
              zoomedInBounds={
                focusedCoordinates || ballotImage.contestCoordinates
              }
            />
          )}
          {isBmd && <BallotStaticImageViewer imageUrl={ballotImage.imageUrl} />}
        </BallotPanel>
        <AdjudicationPanel>
          {focusedOptionId && <AdjudicationPanelOverlay />}
          <BallotHeader>
            <ContestTitleDiv>
              <CompactH2>{getContestDistrictName(election, contest)}</CompactH2>
              <CompactH1>{contest.title}</CompactH1>
            </ContestTitleDiv>
            <Button
              fill="outlined"
              icon="X"
              onPress={onClose}
              variant="inverseNeutral"
            >
              Close
            </Button>
          </BallotHeader>
          <BallotVoteCount>
            <MediumText>
              Votes cast:{' '}
              {isVoteStateReady && (
                <React.Fragment>
                  {format.count(voteCount)} of {format.count(seatCount)}
                </React.Fragment>
              )}
            </MediumText>
            {isOvervote && (
              <Label>
                <Icons.Disabled color="danger" /> Overvote
              </Label>
            )}
          </BallotVoteCount>
          {!isVoteStateReady ? (
            <ContestOptionButtonList style={{ justifyContent: 'center' }}>
              <Icons.Loading />
            </ContestOptionButtonList>
          ) : (
            <ContestOptionButtonList
              role="listbox"
              onKeyDown={handleListboxKeyDown}
            >
              {officialOptions.map((officialOption, idx) => {
                const originalVote = originalVotes.includes(officialOption.id);
                const currentVote = hasVoteByOptionId[officialOption.id];
                const optionLabel = isCandidateContest
                  ? (officialOption as Candidate).name
                  : (officialOption as YesNoOption).label;
                const marginalMarkStatus =
                  marginalMarkStatusByOptionId[officialOption.id];
                function getRef(el: HTMLDivElement | null) {
                  optionRefs.current[idx] = el;
                }
                const { id: optionId } = officialOption;
                return (
                  <ContestOptionButton
                    key={optionId + currentCvrId}
                    isSelected={currentVote}
                    marginalMarkStatus={marginalMarkStatus}
                    ref={getRef}
                    option={{
                      id: optionId,
                      label: optionLabel,
                    }}
                    onSelect={() => setOptionHasVote(optionId, true)}
                    onDeselect={() => setOptionHasVote(optionId, false)}
                    onDismissFlag={() => {
                      resolveMarginalMark(optionId);
                    }}
                    disabled={
                      isBmd ||
                      // Disabled when there is a write-in selection for the candidate
                      (!currentVote &&
                        selectedCandidateNames.includes(optionLabel))
                    }
                    caption={renderContestOptionButtonCaption({
                      originalVote,
                      currentVote,
                      isWriteIn: false,
                      marginalMarkStatus,
                    })}
                    tabIndex={
                      // make the first option requiring adjudication
                      // accessible via tab; if none require adjudication,
                      // make the first contest option accessible via tab
                      firstRequiringAdjudicationId !== undefined
                        ? optionId === firstRequiringAdjudicationId
                          ? 0
                          : -1
                        : idx === 0
                        ? 0
                        : -1
                    }
                  />
                );
              })}
              {writeInOptionIds.map((optionId, idx) => {
                const originalVote = originalVotes.includes(optionId);
                const writeInRecord = writeIns.find(
                  (writeIn) => writeIn.optionId === optionId
                );
                const writeInStatus = writeInStatusByOptionId[optionId];
                const isFocused = focusedOptionId === optionId;
                const isSelected = hasVoteByOptionId[optionId];
                const marginalMarkStatus =
                  marginalMarkStatusByOptionId[optionId];
                function getRef(el: HTMLDivElement | null) {
                  optionRefs.current[officialOptions.length + idx] = el;
                }
                return (
                  <WriteInAdjudicationButton
                    key={optionId + currentCvrId}
                    label={writeInRecord?.machineMarkedText}
                    optionId={optionId}
                    writeInStatus={writeInStatus}
                    marginalMarkStatus={marginalMarkStatus}
                    isFocused={isFocused}
                    isSelected={isSelected}
                    hasInvalidEntry={doubleVoteAlert?.optionId === optionId}
                    // bmd ballots can only toggle-on write-ins that were
                    // previously detected, meaning the status would be defined
                    disabled={isBmd && writeInStatus === undefined}
                    onInputFocus={() => setFocusedOptionId(optionId)}
                    onInputBlur={() => setFocusedOptionId(undefined)}
                    onDismissFlag={() => resolveMarginalMark(optionId)}
                    ref={getRef}
                    tabIndex={
                      optionId === firstRequiringAdjudicationId ? 0 : -1
                    }
                    onChange={(newStatus) => {
                      setFocusedOptionId(undefined);
                      if (isPendingWriteIn(newStatus)) {
                        setOptionWriteInStatus(optionId, newStatus);
                        setOptionHasVote(optionId, true);
                        return;
                      }
                      if (isInvalidWriteIn(newStatus)) {
                        // If there was no write-in record, reset
                        // to undefined instead of invalid
                        setOptionWriteInStatus(
                          optionId,
                          writeInRecord ? newStatus : undefined
                        );
                        setOptionHasVote(optionId, false);
                        if (marginalMarkStatus === 'pending') {
                          resolveMarginalMark(optionId);
                        }
                        return;
                      }
                      const alert = checkForDoubleVote({
                        name: newStatus.name,
                        optionId,
                      });
                      if (alert) {
                        setOptionWriteInStatus(optionId, { type: 'pending' });
                        setDoubleVoteAlert(alert);
                        return;
                      }
                      setOptionWriteInStatus(optionId, newStatus);
                      setOptionHasVote(optionId, true);
                      if (marginalMarkStatus === 'pending') {
                        resolveMarginalMark(optionId);
                      }
                    }}
                    officialCandidates={(officialOptions as Candidate[]).filter(
                      (c) =>
                        !selectedCandidateNames.includes(c.name) ||
                        (isValidCandidate(writeInStatus) &&
                          writeInStatus.name === c.name)
                    )}
                    writeInCandidates={writeInCandidates.filter(
                      (c) =>
                        !selectedCandidateNames.includes(c.name) ||
                        (isValidCandidate(writeInStatus) &&
                          writeInStatus.name === c.name)
                    )}
                    caption={renderContestOptionButtonCaption({
                      originalVote,
                      currentVote: isSelected,
                      isWriteIn: true,
                      writeInRecord,
                      writeInStatus,
                      marginalMarkStatus,
                    })}
                  />
                );
              })}
            </ContestOptionButtonList>
          )}
          <BallotFooter>
            <BallotMetadata>
              <SmallText>
                {format.count(cvrQueueIndex + 1)} of {format.count(numBallots)}{' '}
              </SmallText>
              <SmallText>Ballot ID: {currentCvrId.substring(0, 4)}</SmallText>
            </BallotMetadata>
            <BallotNavigation>
              <PrimaryNavButton
                disabled={
                  !allWriteInsAdjudicated ||
                  !allMarginalMarksAdjudicated ||
                  !isModified
                }
                icon="Done"
                onPress={saveAndNext}
                variant="primary"
              >
                {onLastBallot ? 'Finish' : 'Save & Next'}
              </PrimaryNavButton>
              <SecondaryNavButton
                disabled={onLastBallot}
                onPress={onSkip}
                rightIcon="Next"
              >
                Skip
              </SecondaryNavButton>
              <SecondaryNavButton
                disabled={onFirstBallot}
                icon="Previous"
                onPress={onBack}
              >
                Back
              </SecondaryNavButton>
            </BallotNavigation>
          </BallotFooter>
        </AdjudicationPanel>
        {doubleVoteAlert && (
          <DoubleVoteAlertModal
            doubleVoteAlert={doubleVoteAlert}
            onClose={() => setDoubleVoteAlert(undefined)}
          />
        )}
        {discardChangesNextAction && (
          <DiscardChangesModal
            onBack={() => setDiscardChangesNextAction(undefined)}
            onDiscard={() => {
              switch (discardChangesNextAction) {
                case 'close':
                  onClose();
                  break;
                case 'back':
                  onBack();
                  break;
                case 'skip':
                  onSkip();
                  break;
                default: {
                  /* istanbul ignore next - @preserve */
                  throwIllegalValue(discardChangesNextAction);
                }
              }
              setDiscardChangesNextAction(undefined);
            }}
          />
        )}
      </Main>
    </Screen>
  );
}
