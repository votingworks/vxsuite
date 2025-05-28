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
import { BallotOptionButton } from '../components/ballot_option_button';
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

  button {
    flex-wrap: nowrap;
  }
`;

const BallotOptionButtonList = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
  background: ${(p) => p.theme.colors.background};
  flex-grow: 1;
  padding: ${DEFAULT_PADDING};
  overflow-y: scroll;
`;

const BallotOptionButtonCaption = styled.span`
  color: ${(p) => p.theme.colors.neutral};
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

function renderBallotOptionButtonCaption({
  originalVote,
  currentVote,
  isWriteIn,
  writeInStatus,
  writeInRecord,
}: {
  originalVote: boolean;
  currentVote: boolean;
  isWriteIn: boolean;
  writeInStatus?: WriteInAdjudicationStatus;
  writeInRecord?: WriteInRecord;
}) {
  let originalValueStr: string | undefined;
  let newValueStr: string | undefined;

  if (isWriteIn) {
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
    <BallotOptionButtonCaption>
      <Font weight="semiBold">{originalValueStr} </Font>adjudicated as
      <Font weight="semiBold"> {newValueStr}</Font>
    </BallotOptionButtonCaption>
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
  function clearBallotState() {
    setHasVoteByOptionId({});
    setWriteInStatusByOptionId({});
  }
  const isVoteStateReady = Object.keys(hasVoteByOptionId).length > 0;

  const [focusedOptionId, setFocusedOptionId] = useState<string>();
  const [shouldScrollToWriteIns, setShouldScrollToWriteIns] = useState(false);
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
      !voteAdjudicationsQuery.isStale
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
      let areAllWriteInsAdjudicated = true;
      for (const writeIn of writeInsQuery.data) {
        const { optionId } = writeIn;
        if (writeIn.status === 'pending') {
          areAllWriteInsAdjudicated = false;
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
      initialHasVoteByOptionIdRef.current = newHasVoteByOptionId;
      setWriteInStatusByOptionId(newWriteInStatusByOptionId);
      initialWriteInStatusByOptionIdRef.current = newWriteInStatusByOptionId;
      if (!areAllWriteInsAdjudicated) {
        setShouldScrollToWriteIns(true);
      }
    }
  }, [
    contestId,
    officialOptions,
    cvrVoteInfoQuery.data,
    cvrVoteInfoQuery.isStale,
    cvrVoteInfoQuery.isSuccess,
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

  // Remove focus when escape key is clicked
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      return (
        e.key === 'Escape' && (document.activeElement as HTMLElement)?.blur()
      );
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // On initial load or ballot navigation, autoscroll the user after queries succeed
  const areQueriesFetching =
    cvrVoteInfoQuery.isFetching ||
    cvrQueueQuery.isFetching ||
    firstPendingCvrIdQuery.isFetching ||
    ballotImageViewQuery.isFetching ||
    writeInsQuery.isFetching ||
    writeInCandidatesQuery.isFetching ||
    voteAdjudicationsQuery.isFetching;
  const ballotOptionListRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (
      !areQueriesFetching &&
      shouldScrollToWriteIns &&
      ballotOptionListRef.current
    ) {
      ballotOptionListRef.current.scrollTop =
        ballotOptionListRef.current.scrollHeight;
      setShouldScrollToWriteIns(false);
    }
  }, [shouldScrollToWriteIns, areQueriesFetching]);

  // Only show full loading screen on initial load to mitigate screen flicker on scroll
  if (
    !isQueueReady ||
    !maybeCurrentCvrId ||
    !cvrVoteInfoQuery.data ||
    !writeInCandidatesQuery.data ||
    !writeInsQuery.data ||
    !voteAdjudicationsQuery.data ||
    !writeInImagesQuery.data
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

  const firstWriteInImage = writeInImages[0];
  const focusedWriteInImage = focusedOptionId
    ? writeInImages.find((item) => item.optionId === focusedOptionId)
    : undefined;
  const isHmpb = firstWriteInImage.type === 'hmpb';
  const isBmd = firstWriteInImage.type === 'bmd';
  const { side } = firstWriteInImage;

  const numBallots = cvrQueueQuery.data.length;
  const onLastBallot = cvrQueueIndex + 1 === numBallots;

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

  const isModified =
    !deepEqual(hasVoteByOptionId, initialHasVoteByOptionIdRef.current) ||
    !deepEqual(
      writeInStatusByOptionId,
      initialWriteInStatusByOptionIdRef.current
    );

  function onSkip(): void {
    if (isModified && !discardChangesNextAction) {
      setDiscardChangesNextAction('skip');
      return;
    }
    setMaybeCvrQueueIndex(cvrQueueIndex + 1);
    clearBallotState();
  }

  function onBack(): void {
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
            <BallotOptionButtonList style={{ justifyContent: 'center' }}>
              <Icons.Loading />
            </BallotOptionButtonList>
          ) : (
            <BallotOptionButtonList ref={ballotOptionListRef}>
              {officialOptions.map((officialOption) => {
                const originalVote = originalVotes.includes(officialOption.id);
                const currentVote = hasVoteByOptionId[officialOption.id];
                const optionLabel = isCandidateContest
                  ? (officialOption as Candidate).name
                  : (officialOption as YesNoOption).label;
                return (
                  <BallotOptionButton
                    key={officialOption.id + currentCvrId}
                    option={{
                      id: officialOption.id,
                      label: optionLabel,
                    }}
                    isSelected={currentVote}
                    onSelect={() => setOptionHasVote(officialOption.id, true)}
                    onDeselect={() =>
                      setOptionHasVote(officialOption.id, false)
                    }
                    disabled={
                      isBmd ||
                      // Disabled when there is a write-in selection for the candidate
                      (!currentVote &&
                        selectedCandidateNames.includes(optionLabel))
                    }
                    caption={renderBallotOptionButtonCaption({
                      originalVote,
                      currentVote,
                      isWriteIn: false,
                    })}
                  />
                );
              })}
              {writeInOptionIds.map((optionId) => {
                const originalVote = originalVotes.includes(optionId);
                const writeInRecord = writeIns.find(
                  (writeIn) => writeIn.optionId === optionId
                );
                const writeInStatus = writeInStatusByOptionId[optionId];
                const isFocused = focusedOptionId === optionId;
                const isSelected = hasVoteByOptionId[optionId];
                if (!writeInStatus || isInvalidWriteIn(writeInStatus)) {
                  return (
                    <BallotOptionButton
                      option={{
                        id: optionId,
                        label: writeInRecord?.machineMarkedText ?? 'Write-in',
                      }}
                      // bmd ballots can only toggle-on write-ins that were
                      // previously marked invalid
                      disabled={isBmd && !isInvalidWriteIn(writeInStatus)}
                      isSelected={false}
                      key={optionId + currentCvrId}
                      onSelect={() => {
                        setOptionHasVote(optionId, true);
                        setOptionWriteInStatus(optionId, { type: 'pending' });
                      }}
                      caption={renderBallotOptionButtonCaption({
                        originalVote,
                        currentVote: false,
                        isWriteIn: true,
                        writeInRecord,
                        writeInStatus,
                      })}
                    />
                  );
                }
                return (
                  <WriteInAdjudicationButton
                    key={optionId + currentCvrId}
                    isFocused={isFocused}
                    isSelected={isSelected}
                    hasInvalidEntry={doubleVoteAlert?.optionId === optionId}
                    label={writeInRecord?.machineMarkedText}
                    status={writeInStatus}
                    onInputFocus={() => setFocusedOptionId(optionId)}
                    onInputBlur={() => setFocusedOptionId(undefined)}
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
                    caption={renderBallotOptionButtonCaption({
                      originalVote,
                      currentVote: isSelected,
                      isWriteIn: true,
                      writeInRecord,
                      writeInStatus,
                    })}
                  />
                );
              })}
            </BallotOptionButtonList>
          )}
          <BallotFooter>
            <BallotMetadata>
              <SmallText>
                {format.count(cvrQueueIndex + 1)} of {format.count(numBallots)}{' '}
              </SmallText>
              <SmallText>Ballot ID: {currentCvrId.substring(0, 4)}</SmallText>
            </BallotMetadata>
            <BallotNavigation>
              <SecondaryNavButton
                disabled={cvrQueueIndex === 0}
                icon="Previous"
                onPress={onBack}
              >
                Back
              </SecondaryNavButton>
              <SecondaryNavButton
                disabled={onLastBallot}
                onPress={onSkip}
                rightIcon="Next"
              >
                Skip
              </SecondaryNavButton>
              <PrimaryNavButton
                disabled={!allWriteInsAdjudicated}
                icon="Done"
                onPress={saveAndNext}
                variant="primary"
              >
                {onLastBallot ? 'Finish' : 'Save & Next'}
              </PrimaryNavButton>
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
