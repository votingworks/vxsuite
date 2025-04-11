import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';
import { ContestOptionId, getContestDistrictName } from '@votingworks/types';
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
  P,
} from '@votingworks/ui';
import { assert, find, iter, throwIllegalValue } from '@votingworks/basics';
import type {
  AdjudicatedContestOption,
  AdjudicatedCvrContest,
  WriteInRecord,
} from '@votingworks/admin-backend';
import { allContestOptions, format } from '@votingworks/utils';
import { useHistory, useParams } from 'react-router-dom';
import {
  getCastVoteRecordVoteInfo,
  getCvrWriteInImageViews,
  getFirstPendingWriteInCvrId,
  getWriteIns,
  getWriteInAdjudicationCvrQueue,
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

export type WriteInAdjudicationStatus =
  | ExistingOfficialCandidate
  | ExistingWriteInCandidate
  | NewCandidate
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
  | NewCandidate {
  return (
    status?.type === 'existing-official' ||
    status?.type === 'existing-write-in' ||
    status?.type === 'new'
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

function renderCandidateButtonCaption({
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
    <CandidateButtonCaption>
      <Font weight="semiBold">{originalValueStr} </Font>adjudicated as
      <Font weight="semiBold"> {newValueStr}</Font>
    </CandidateButtonCaption>
  );
}

export function ContestAdjudicationScreen(): JSX.Element {
  const history = useHistory();
  const { contestId } = useParams<ContestAdjudicationScreenParams>();
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  const contest = find(election.contests, (c) => c.id === contestId);
  assert(contest.type === 'candidate', 'contest must be a candidate contest');

  // Queries and mutations
  const [cvrQueueIndex, setCvrQueueIndex] = useState<number>();
  const cvrQueueQuery = getWriteInAdjudicationCvrQueue.useQuery({
    contestId: contest.id,
  });
  const firstPendingCvrIdQuery = getFirstPendingWriteInCvrId.useQuery({
    contestId: contest.id,
  });
  const isQueueReady = cvrQueueIndex !== undefined && cvrQueueQuery.data;
  const currentCvrId = isQueueReady ? cvrQueueQuery.data[cvrQueueIndex] : '';
  const cvrVoteInfoQuery = getCastVoteRecordVoteInfo.useQuery(
    currentCvrId ? { cvrId: currentCvrId } : undefined
  );
  const voteAdjudicationsQuery = getVoteAdjudications.useQuery(
    currentCvrId ? { cvrId: currentCvrId, contestId } : undefined
  );
  const writeInsQuery = getWriteIns.useQuery(
    currentCvrId ? { cvrId: currentCvrId, contestId } : undefined
  );
  const writeInImagesQuery = getCvrWriteInImageViews.useQuery(
    currentCvrId ? { cvrId: currentCvrId, contestId } : undefined
  );
  const writeInCandidatesQuery = getWriteInCandidates.useQuery({
    contestId: contest.id,
  });

  const adjudicateCvrContestMutation = adjudicateCvrContest.useMutation();
  const officialCandidates = useMemo(
    () => contest.candidates.filter((c) => !c.isWriteIn),
    [contest.candidates]
  );
  const writeInOptionIds = useMemo(
    () =>
      iter(allContestOptions(contest))
        .filterMap((option) => (option.isWriteIn ? option.id : undefined))
        .toArray(),
    [contest]
  );

  // Vote and write-in state for adjudication management
  const [hasVoteByOptionId, setHasVoteByOptionId] = useState<HasVoteByOptionId>(
    {}
  );
  const [writeInStatusByOptionId, setWriteInStatusByOptionId] =
    useState<WriteInStatusByOptionId>({});
  function setOptionHasVote(optionId: ContestOptionId, hasVote: boolean) {
    setHasVoteByOptionId((prev) => ({
      ...prev,
      [optionId]: hasVote,
    }));
  }
  function setOptionWriteInStatus(
    optionId: ContestOptionId,
    status: WriteInAdjudicationStatus
  ) {
    setWriteInStatusByOptionId((prev) => ({
      ...prev,
      [optionId]: status,
    }));
  }
  const isStateReady = Object.keys(hasVoteByOptionId).length > 0;

  const [focusedOptionId, setFocusedOptionId] = useState<string>();
  const [shouldAutoscrollUser, setShouldAutoscrollUser] = useState(false);
  const [doubleVoteAlert, setDoubleVoteAlert] = useState<DoubleVoteAlert>();
  // isStateStale prevents showing new CVR data with stale state when revisiting a previously loaded CVR.
  // Without this check, state resets one render after query data, causing a brief mismatch.
  const [isStateStale, setIsStateStale] = useState(false);

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
      for (const c of officialCandidates) {
        newHasVoteByOptionId[c.id] = originalVotes.includes(c.id);
      }
      for (const optionId of writeInOptionIds) {
        newHasVoteByOptionId[optionId] = originalVotes.includes(optionId);
      }
      for (const adjudication of voteAdjudicationsQuery.data) {
        newHasVoteByOptionId[adjudication.optionId] = adjudication.isVote;
      }
      const newWriteInStatusByOptionId: WriteInStatusByOptionId = {};
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
            const candidate = officialCandidates.find(
              (c) => c.id === writeIn.candidateId
            );
            assert(candidate !== undefined);
            newWriteInStatusByOptionId[optionId] = {
              ...candidate,
              type: 'existing-official',
            };
            newHasVoteByOptionId[optionId] = true;
            break;
          }
          case 'write-in-candidate': {
            const candidate = writeInCandidatesQuery.data.find(
              (c) => c.id === writeIn.candidateId
            );
            assert(candidate !== undefined);
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
      setIsStateStale(false);
      if (!areAllWriteInsAdjudicated) {
        setShouldAutoscrollUser(true);
      }
    }
  }, [
    cvrQueueIndex,
    contestId,
    officialCandidates,
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
      cvrQueueIndex === undefined &&
      cvrQueueQuery.isSuccess &&
      firstPendingCvrIdQuery.isSuccess
    ) {
      const cvrQueue = cvrQueueQuery.data;
      const cvrId = firstPendingCvrIdQuery.data;
      if (cvrId) {
        setCvrQueueIndex(cvrQueue.indexOf(cvrId));
      } else {
        setCvrQueueIndex(0);
      }
    }
  }, [firstPendingCvrIdQuery, cvrQueueQuery, cvrQueueIndex]);

  // Prefetch the next and previous ballot images
  const prefetchImageViews = getCvrWriteInImageViews.usePrefetch();
  useEffect(() => {
    if (!cvrQueueQuery.isSuccess || cvrQueueIndex === undefined) return;
    const nextCvrId = cvrQueueQuery.data[cvrQueueIndex + 1];
    if (nextCvrId) {
      void prefetchImageViews({ cvrId: nextCvrId, contestId });
    }
    const prevCvrId = cvrQueueQuery.data[cvrQueueIndex - 1];
    if (prevCvrId) {
      void prefetchImageViews({ cvrId: prevCvrId, contestId });
    }
  }, [contestId, cvrQueueIndex, cvrQueueQuery, prefetchImageViews]);

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
    writeInImagesQuery.isFetching ||
    writeInsQuery.isFetching ||
    writeInCandidatesQuery.isFetching ||
    voteAdjudicationsQuery.isFetching;
  const candidateListRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (
      !areQueriesFetching &&
      shouldAutoscrollUser &&
      candidateListRef.current
    ) {
      candidateListRef.current.scrollTop =
        candidateListRef.current.scrollHeight;
      setShouldAutoscrollUser(false);
    }
  }, [shouldAutoscrollUser, areQueriesFetching]);

  // Only show full loading screen on initial load to mitigate screen flicker on scroll
  if (
    !isQueueReady ||
    !isStateReady ||
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
  const writeInImages = writeInImagesQuery.data;
  const writeInCandidates = writeInCandidatesQuery.data;
  const safeCvrQueueIndex = cvrQueueIndex;

  const voteCount = Object.values(hasVoteByOptionId).filter(Boolean).length;
  const seatCount = contest.seats;
  const isOvervote = voteCount > seatCount;
  const numPendingWriteIns = writeInOptionIds.filter((optionId) =>
    isPendingWriteIn(writeInStatusByOptionId[optionId])
  ).length;
  const allWriteInsAdjudicated = numPendingWriteIns === 0;

  const firstWriteInImage = writeInImages[0];
  const focusedWriteInImage = focusedOptionId
    ? writeInImages.find((item) => item.optionId === focusedOptionId)
    : undefined;
  const isHmpb = firstWriteInImage.type === 'hmpb';
  const isBmd = firstWriteInImage.type === 'bmd';
  const { side } = firstWriteInImage;

  const numBallots = cvrQueueQuery.data?.length ?? 0;
  const onLastBallot = cvrQueueIndex + 1 === numBallots;

  const selectedCandidateNames = Object.entries(hasVoteByOptionId)
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
      const official = officialCandidates.find((c) => c.id === optionId);
      assert(official !== undefined);
      return official.name;
    })
    .filter(Boolean);

  function checkForDoubleVote({
    name,
    optionId,
  }: {
    name: string;
    optionId: string;
  }): DoubleVoteAlert | undefined {
    const normalizedName = normalizeWriteInName(name);
    const existingCandidate = officialCandidates.find(
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

  function saveAndNext(): void {
    const adjudicatedContestOptionById: Record<
      ContestOptionId,
      AdjudicatedContestOption
    > = {};
    const adjudicatedCvrContest: AdjudicatedCvrContest = {
      side,
      cvrId: currentCvrId,
      contestId,
      adjudicatedContestOptionById,
    };
    const officialCandidateOptionIds = officialCandidates.map((c) => c.id);
    for (const optionId of officialCandidateOptionIds) {
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

    adjudicateCvrContestMutation.mutate(adjudicatedCvrContest);
    if (onLastBallot) {
      history.push(routerPaths.writeIns);
    } else {
      setCvrQueueIndex(safeCvrQueueIndex + 1);
      setIsStateStale(true);
    }
  }

  return (
    <Screen>
      <Main flexRow>
        <BallotPanel>
          {isHmpb && (
            <BallotZoomImageViewer
              ballotBounds={firstWriteInImage.ballotCoordinates}
              key={currentCvrId} // Reset zoom state for each write-in
              imageUrl={firstWriteInImage.imageUrl}
              zoomedInBounds={
                focusedWriteInImage?.type === 'hmpb'
                  ? focusedWriteInImage.writeInCoordinates
                  : firstWriteInImage.contestCoordinates
              }
            />
          )}
          {isBmd && (
            <BallotStaticImageViewer imageUrl={firstWriteInImage.imageUrl} />
          )}
        </BallotPanel>
        <AdjudicationPanel>
          {focusedOptionId && <AdjudicationPanelOverlay />}
          <BallotHeader>
            <ContestTitleDiv>
              <CompactH2>{getContestDistrictName(election, contest)}</CompactH2>
              <CompactH1>{contest.title}</CompactH1>
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
              Votes cast: {format.count(voteCount)} of {format.count(seatCount)}
            </MediumText>
            {isOvervote && (
              <Label>
                <Icons.Disabled color="danger" /> Overvote
              </Label>
            )}
          </BallotVoteCount>
          {areQueriesFetching || isStateStale ? (
            <CandidateButtonList style={{ justifyContent: 'center' }}>
              <Icons.Loading />
            </CandidateButtonList>
          ) : (
            <CandidateButtonList ref={candidateListRef}>
              {officialCandidates.map((candidate) => {
                const originalVote = originalVotes.includes(candidate.id);
                const currentVote = hasVoteByOptionId[candidate.id];
                return (
                  <CandidateButton
                    key={candidate.id + currentCvrId}
                    candidate={candidate}
                    isSelected={currentVote}
                    onSelect={() => setOptionHasVote(candidate.id, true)}
                    onDeselect={() => setOptionHasVote(candidate.id, false)}
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
                const originalVote = originalVotes.includes(optionId);
                const writeInRecord = writeIns.find(
                  (writeIn) => writeIn.optionId === optionId
                );
                const writeInStatus = writeInStatusByOptionId[optionId];
                const isFocused = focusedOptionId === optionId;
                const isSelected = hasVoteByOptionId[optionId];
                if (!writeInStatus || isInvalidWriteIn(writeInStatus)) {
                  return (
                    <CandidateButton
                      candidate={{
                        id: optionId,
                        name: 'Write-in',
                      }}
                      isSelected={false}
                      key={optionId + currentCvrId}
                      onSelect={() => {
                        setOptionHasVote(optionId, true);
                        setOptionWriteInStatus(optionId, {
                          type: 'pending',
                        });
                      }}
                      onDeselect={() => undefined} // Cannot be reached
                      caption={renderCandidateButtonCaption({
                        originalVote,
                        currentVote: false,
                        isWriteIn: true,
                        writeInRecord,
                        writeInStatus,
                      })}
                    />
                  );
                }
                let stringValue: string;
                switch (writeInStatus.type) {
                  case 'pending': {
                    stringValue = '';
                    break;
                  }
                  case 'new':
                  case 'existing-official':
                  case 'existing-write-in': {
                    stringValue = writeInStatus.name;
                    break;
                  }
                  default: {
                    /* istanbul ignore next - @preserve */
                    throwIllegalValue(writeInStatus, 'type');
                  }
                }
                return (
                  <WriteInAdjudicationButton
                    key={optionId + currentCvrId}
                    isFocused={isFocused}
                    isSelected={isSelected}
                    hasInvalidEntry={doubleVoteAlert?.optionId === optionId}
                    onInputFocus={() => setFocusedOptionId(optionId)}
                    onInputBlur={() => setFocusedOptionId(undefined)}
                    value={stringValue}
                    onChange={(newStatus) => {
                      setFocusedOptionId(undefined);
                      if (isPendingWriteIn(newStatus)) {
                        setOptionWriteInStatus(optionId, newStatus);
                        return;
                      }
                      if (isInvalidWriteIn(newStatus)) {
                        setOptionWriteInStatus(optionId, newStatus);
                        if (isSelected) {
                          setOptionHasVote(optionId, false);
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
                      if (!isSelected) {
                        setOptionHasVote(optionId, true);
                      }
                    }}
                    toggleVote={() => {
                      if (isSelected) {
                        if (isFocused) {
                          setFocusedOptionId(undefined);
                        }
                        setOptionHasVote(optionId, false);
                        setOptionWriteInStatus(optionId, { type: 'invalid' });
                      } else {
                        setOptionHasVote(optionId, true);
                        setOptionWriteInStatus(optionId, { type: 'pending' });
                      }
                    }}
                    officialCandidates={officialCandidates.filter(
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
                    caption={renderCandidateButtonCaption({
                      originalVote,
                      currentVote: isSelected,
                      isWriteIn: true,
                      writeInRecord,
                      writeInStatus,
                    })}
                  />
                );
              })}
            </CandidateButtonList>
          )}
          <BallotFooter>
            <BallotMetadata>
              <SmallText>
                {format.count(cvrQueueIndex + 1)} of {format.count(numBallots)}{' '}
              </SmallText>
              <SmallText>Ballot ID: {currentCvrId?.substring(0, 4)}</SmallText>
            </BallotMetadata>
            <BallotNavigation>
              <SecondaryNavButton
                disabled={cvrQueueIndex === 0}
                icon="Previous"
                onPress={() => {
                  setCvrQueueIndex(cvrQueueIndex - 1);
                  setIsStateStale(true);
                }}
              >
                Back
              </SecondaryNavButton>
              <SecondaryNavButton
                disabled={onLastBallot}
                onPress={() => {
                  setCvrQueueIndex(cvrQueueIndex + 1);
                  setIsStateStale(true);
                }}
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
      </Main>
    </Screen>
  );
}
