import { useContext, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import {
  Candidate,
  CandidateContest,
  CandidateId,
  getContestDistrictName,
  getPartyAbbreviationByPartyId,
  Id,
} from '@votingworks/types';
import {
  Button,
  Main,
  Screen,
  Font,
  Caption,
  H2,
  LinkButton,
  Loading,
  H1,
  H4,
} from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { assert, find } from '@votingworks/basics';
import { useQueryClient } from '@tanstack/react-query';
import type {
  WriteInCandidateRecord,
  WriteInRecordAdjudicatedOfficialCandidate,
} from '@votingworks/admin-backend';
import { useParams } from 'react-router-dom';
import {
  getWriteInAdjudicationContext,
  getWriteInAdjudicationQueue,
  getWriteInCandidates,
  adjudicateWriteIn,
  useApiClient,
  addWriteInCandidate,
  getWriteInAdjudicationQueueMetadata,
  getWriteInImageView,
  getFirstPendingWriteInId,
} from '../api';
import { normalizeWriteInName } from '../utils/write_ins';
import { AppContext } from '../contexts/app_context';
import { WriteInsAdjudicationScreenProps } from '../config/types';
import { routerPaths } from '../router_paths';
import {
  BallotStaticImageViewer,
  BallotZoomImageViewer,
} from '../components/adjudication_ballot_image_viewer';
import {
  DoubleVoteAlert,
  DoubleVoteAlertModal,
} from '../components/adjudication_double_vote_alert_modal';
import { HeaderActions } from '../components/navigation_screen';

const AdjudicationHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.25rem 0.5rem;
  background: ${(p) => p.theme.colors.inverseBackground};
  color: ${(p) => p.theme.colors.onInverse};

  h1 {
    margin: 0;
  }

  button {
    padding: 0.5rem;
  }
`;

const ContestTitleContainer = styled.div`
  background: ${(p) => p.theme.colors.containerLow};
  padding: 0.5rem;
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
`;

const ContestTitle = styled(H2)`
  font-size: ${(p) => p.theme.sizes.headingsRem.h3}rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.regular};

  /*
   * Override heading styling.
   * TODO: Update shared heading components to omit margins when heading is the
   * last/only child in its container.
   */
  margin: 0 !important;
`;

const ContestSubTitle = styled.div`
  padding-top: 0.5rem;
  word-break: break-word;
`;

const WriteInText = styled.span`
  font-weight: bold;
  color: ${(p) => p.theme.colors.primary};
`;

const AdjudicationStickyFooter = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: auto;
  padding: 0.5rem;
  background: ${(p) => p.theme.colors.containerLow};
  border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
`;

const AdjudicationNav = styled.div`
  align-items: center;
  display: flex;
  gap: 0.5rem;
  flex-direction: row;

  button {
    flex: 1;
    flex-wrap: nowrap;

    /* Make sure the Next and Finish button are the same width */
    min-width: 7rem;
  }
`;

const BallotViews = styled.div`
  /* Since the edges of the ballot image are black, using a black background
   * creates the least noise. */
  background: black;
  flex: 1;
`;

const AdjudicationControls = styled.div`
  display: flex;
  flex-direction: column;
  width: 20rem;
`;

const AdjudicationMetadata = styled(Caption)`
  display: flex;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  background: ${(p) => p.theme.colors.containerHigh};
`;

const AdjudicationForm = styled.div`
  overflow: scroll;
  padding: 0.5rem;
`;

const WriteInActionButton = styled(Button)`
  /* Emulate radio group options */
  padding-left: 0.5rem;
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
`;

const SectionLabel = styled.div`
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  margin-bottom: 0.5rem;

  :not(:first-child) {
    margin-top: 1rem;
  }
`;

// styles closely imitate our RadioGroup buttons, but we don't use RadioGroup
// because we need to be able to deselect options by clicking them again
const CandidateStyledButton = styled(Button)`
  border-color: ${(p) => p.theme.colors.outline};
  border-width: ${(p) => p.theme.sizes.bordersRem.thin}rem;
  flex-wrap: nowrap;
  font-weight: ${(p) => p.theme.sizes.fontWeight.regular};
  justify-content: start;
  padding-left: 0.5rem;
  text-align: left;
  width: 100%;
  word-break: break-word;

  /* Increase contrast between selected/unselected options when disabled by
   * removing the darkening filter for unselected options. */
  &[disabled] {
    ${(p) => p.color === 'neutral' && `filter: none;`}
  }
`;

function CandidateButton({
  candidate,
  isSelected,
  isSelectedStatusUpToDate,
  onSelect,
  onDeselect,
}: {
  candidate: Pick<Candidate, 'id' | 'name'>;
  isSelected?: boolean;
  isSelectedStatusUpToDate: boolean;
  onSelect: () => void;
  onDeselect: () => void;
}) {
  return (
    <CandidateStyledButton
      key={candidate.id}
      onPress={() => {
        if (!isSelectedStatusUpToDate) return;

        if (!isSelected) {
          onSelect();
        } else {
          onDeselect();
        }
      }}
      color={isSelected ? 'primary' : 'neutral'}
      fill={isSelected ? 'tinted' : 'outlined'}
      icon={isSelected ? 'CircleDot' : 'Circle'}
    >
      {candidate.name}
    </CandidateStyledButton>
  );
}

const CandidateButtonList = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
`;

export function WriteInsAdjudicationScreen(): JSX.Element {
  const { contestId } = useParams<WriteInsAdjudicationScreenProps>();
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  const contest = find(
    election.contests,
    (c) => c.id === contestId
  ) as CandidateContest;

  const queryClient = useQueryClient();
  const apiClient = useApiClient();

  const [offset, setOffset] = useState(0);
  const writeInQueueQuery = getWriteInAdjudicationQueue.useQuery({
    contestId: contest.id,
  });
  const firstPendingWriteInIdQuery = getFirstPendingWriteInId.useQuery({
    contestId: contest.id,
  });
  const writeInQueueMetadataQuery =
    getWriteInAdjudicationQueueMetadata.useQuery({ contestId });
  const [initialOffsetSet, setInitialOffsetSet] = useState(false);

  const adjudicateWriteInMutation = adjudicateWriteIn.useMutation();
  const addWriteInCandidateMutation = addWriteInCandidate.useMutation();
  const writeInCandidatesQuery = getWriteInCandidates.useQuery({
    contestId: contest.id,
  });

  const currentWriteInId =
    writeInQueueQuery.data && initialOffsetSet
      ? writeInQueueQuery.data[offset]
      : undefined;
  const writeInImageViewQuery = getWriteInImageView.useQuery(
    {
      writeInId: currentWriteInId ?? 'no-op',
    },
    !!currentWriteInId
  );
  const writeInAdjudicationContextQuery =
    getWriteInAdjudicationContext.useQuery(
      {
        writeInId: currentWriteInId ?? 'no-op',
      },
      !!currentWriteInId
    );

  // sets the user's position in the adjudication queue to the first pending write-in
  useEffect(() => {
    if (
      firstPendingWriteInIdQuery.isSuccess &&
      writeInQueueQuery.isSuccess &&
      !initialOffsetSet
    ) {
      const firstPendingWriteInId = firstPendingWriteInIdQuery.data;
      const writeInQueue = writeInQueueQuery.data;
      if (firstPendingWriteInId) {
        setOffset(writeInQueue.indexOf(firstPendingWriteInId));
      }
      setInitialOffsetSet(true);
    }
  }, [firstPendingWriteInIdQuery, writeInQueueQuery, initialOffsetSet]);

  // prefetch the next and previous write-in image
  useEffect(() => {
    if (!writeInQueueQuery.isSuccess || !initialOffsetSet) return;

    function prefetch(writeInId: Id) {
      // prefetching won't run if the query is already in the cache
      void queryClient.prefetchQuery({
        queryKey: getWriteInImageView.queryKey({
          writeInId,
        }),
        queryFn: () => apiClient.getWriteInImageView({ writeInId }),
      });
    }

    const nextWriteInId = writeInQueueQuery.data[offset + 1];
    if (nextWriteInId) {
      prefetch(nextWriteInId);
    }

    const previousWriteInId = writeInQueueQuery.data[offset - 1];
    if (previousWriteInId) {
      prefetch(previousWriteInId);
    }
  }, [apiClient, queryClient, writeInQueueQuery, offset, initialOffsetSet]);

  const [doubleVoteAlert, setDoubleVoteAlert] = useState<DoubleVoteAlert>();
  const [showNewWriteInCandidateForm, setShowNewWriteInCandidateForm] =
    useState(false);
  const [newWriteInCandidateName, setNewWriteInCandidateName] =
    useState<string>();
  const nextButton = useRef<Button>(null);
  const firstAdjudicationControl = useRef<HTMLFieldSetElement>(null);

  const writeInAdjudicationContext = writeInAdjudicationContextQuery.data;
  const currentWriteIn = writeInAdjudicationContext?.writeIn;
  const currentWriteInMarkedInvalid =
    currentWriteIn &&
    currentWriteIn.status === 'adjudicated' &&
    currentWriteIn.adjudicationType === 'invalid';

  const writeInImageView = writeInImageViewQuery.data;
  const isHmpbWriteIn =
    writeInImageView && 'ballotCoordinates' in writeInImageView;
  const isBmdWriteIn =
    writeInImageView && 'machineMarkedText' in writeInImageView;

  if (
    !writeInQueueMetadataQuery.isSuccess ||
    !writeInQueueQuery.isSuccess ||
    !writeInCandidatesQuery.isSuccess ||
    !firstPendingWriteInIdQuery.isSuccess ||
    !initialOffsetSet ||
    !currentWriteInId
  ) {
    return (
      <Screen>
        <AdjudicationHeader>
          <H1>Write-In Adjudication</H1>
          <HeaderActions>
            <LinkButton variant="inverseNeutral" to={routerPaths.writeIns}>
              Back to All Write-Ins
            </LinkButton>
          </HeaderActions>
        </AdjudicationHeader>
        <Loading isFullscreen />
      </Screen>
    );
  }

  const totalWriteIns = writeInQueueMetadataQuery.data[0].totalTally;
  const isLastAdjudication = offset >= totalWriteIns - 1;

  const officialCandidates = [...contest.candidates]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((candidate) => !candidate.isWriteIn);
  const writeInCandidates = writeInCandidatesQuery.data;
  const disallowedWriteInCandidateNames = [
    '',
    ...officialCandidates.map((c) => normalizeWriteInName(c.name)),
    ...writeInCandidates.map((c) => normalizeWriteInName(c.name)),
  ];

  // these IDs cannot be selected because the voter filled in a bubble for the candidate
  const markedOfficialCandidateIds = writeInAdjudicationContext
    ? (
        (writeInAdjudicationContext.cvrVotes[contestId] as CandidateId[]) ?? []
      ).filter((candidateId) => !candidateId.startsWith('write-in-'))
    : [];
  // these IDs cannot be selected because another write-in on this ballot
  // has already been adjudicated for the same official candidate
  const writeInAdjudicatedOfficialCandidateIds = writeInAdjudicationContext
    ? writeInAdjudicationContext.relatedWriteIns
        .filter(
          (w): w is WriteInRecordAdjudicatedOfficialCandidate =>
            w.status === 'adjudicated' &&
            w.adjudicationType === 'official-candidate'
        )
        .map((w) => w.candidateId)
    : [];
  // these IDs cannot be selected because another write-in on this ballot
  // has already been adjudicated for the same write-in candidate
  const writeInAdjudicatedWriteInCandidateIds = writeInAdjudicationContext
    ? writeInAdjudicationContext.relatedWriteIns
        .filter(
          (w): w is WriteInRecordAdjudicatedOfficialCandidate =>
            w.status === 'adjudicated' &&
            w.adjudicationType === 'write-in-candidate'
        )
        .map((w) => w.candidateId)
    : [];

  function hideNewWriteInCandidateForm() {
    setNewWriteInCandidateName(undefined);
    setShowNewWriteInCandidateForm(false);
  }

  function goPrevious() {
    setOffset((v) => v - 1);
    hideNewWriteInCandidateForm();
  }
  function goNext() {
    setOffset((v) => v + 1);
    hideNewWriteInCandidateForm();
    nextButton.current?.blur();
    // For some reason, focusing on the RadioGroup fieldset itself doesn't seem
    // to work, we have to pick out an individual input
    firstAdjudicationControl.current?.getElementsByTagName('input')[0]?.focus();
  }
  function focusNext() {
    setTimeout(() => {
      nextButton.current?.focus();
    }, 0);
  }

  const isWriteInAdjudicationContextFresh =
    writeInAdjudicationContextQuery.isSuccess &&
    !writeInAdjudicationContextQuery.isStale;

  function adjudicateAsOfficialCandidate(officialCandidate: Candidate): void {
    if (markedOfficialCandidateIds.includes(officialCandidate.id)) {
      setDoubleVoteAlert({
        type: 'marked-official-candidate',
        name: officialCandidate.name,
      });
      return;
    }
    if (writeInAdjudicatedOfficialCandidateIds.includes(officialCandidate.id)) {
      setDoubleVoteAlert({
        type: 'adjudicated-official-candidate',
        name: officialCandidate.name,
      });
      return;
    }

    assert(currentWriteInId !== undefined);
    adjudicateWriteInMutation.mutate({
      writeInId: currentWriteInId,
      type: 'official-candidate',
      candidateId: officialCandidate.id,
    });
    focusNext();
  }
  function adjudicateAsWriteInCandidate(
    writeInCandidate: WriteInCandidateRecord
  ): void {
    if (writeInAdjudicatedWriteInCandidateIds.includes(writeInCandidate.id)) {
      setDoubleVoteAlert({
        type: 'adjudicated-write-in-candidate',
        name: writeInCandidate.name,
      });
      return;
    }
    assert(currentWriteInId !== undefined);
    adjudicateWriteInMutation.mutate({
      writeInId: currentWriteInId,
      type: 'write-in-candidate',
      candidateId: writeInCandidate.id,
    });
    focusNext();
  }
  function adjudicateAsInvalid(): void {
    assert(currentWriteInId !== undefined);
    adjudicateWriteInMutation.mutate({
      writeInId: currentWriteInId,
      type: 'invalid',
    });
    focusNext();
  }
  function resetAdjudication(): void {
    assert(currentWriteInId !== undefined);
    adjudicateWriteInMutation.mutate({
      writeInId: currentWriteInId,
      type: 'reset',
    });
  }

  async function onAddWriteInCandidate() {
    assert(currentWriteInId !== undefined);
    const name = newWriteInCandidateName;
    if (!name) return;
    if (disallowedWriteInCandidateNames.includes(normalizeWriteInName(name))) {
      return;
    }

    try {
      const writeInCandidate = await addWriteInCandidateMutation.mutateAsync({
        contestId: contest.id,
        name,
      });
      adjudicateAsWriteInCandidate(writeInCandidate);
      hideNewWriteInCandidateForm();
    } catch (error) {
      // Handled by default query client error handling
    }
  }

  return (
    <Screen>
      <Main flexRow data-testid={`transcribe:${currentWriteInId}`}>
        <BallotViews>
          {isHmpbWriteIn ? (
            <BallotZoomImageViewer
              key={currentWriteInId} // Reset zoom state for each write-in
              imageUrl={writeInImageView.imageUrl}
              ballotBounds={writeInImageView.ballotCoordinates}
              writeInBounds={writeInImageView.writeInCoordinates}
            />
          ) : isBmdWriteIn ? (
            <BallotStaticImageViewer
              key={currentWriteInId} // Reset zoom state for each write-in
              imageUrl={writeInImageView.imageUrl}
            />
          ) : null}
        </BallotViews>
        <AdjudicationControls>
          <AdjudicationHeader>
            <H4 as="h1">Adjudicate Write-In</H4>
            <LinkButton
              icon="X"
              variant="inverseNeutral"
              fill="transparent"
              to={routerPaths.writeIns}
            >
              Close
            </LinkButton>
          </AdjudicationHeader>
          <AdjudicationMetadata>
            <span>
              Ballot ID:{' '}
              <Font weight="bold">
                {writeInImageView
                  ? writeInImageView.cvrId.substring(0, 4)
                  : '-'}
              </Font>
            </span>{' '}
            <span>
              Adjudication ID:{' '}
              <Font weight="bold">{currentWriteInId.substring(0, 4)}</Font>
            </span>
          </AdjudicationMetadata>
          <ContestTitleContainer>
            <Caption>{getContestDistrictName(election, contest)}</Caption>
            <ContestTitle>
              <span>
                {contest.title}
                {contest.partyId &&
                  ` (${getPartyAbbreviationByPartyId({
                    partyId: contest.partyId,
                    election,
                  })})`}
              </span>
            </ContestTitle>
            {isBmdWriteIn && (
              <ContestSubTitle>
                Write-In Text:{' '}
                <WriteInText>{writeInImageView.machineMarkedText}</WriteInText>
              </ContestSubTitle>
            )}
          </ContestTitleContainer>
          <AdjudicationForm>
            {officialCandidates.length > 0 ? (
              <SectionLabel>Official Candidates</SectionLabel>
            ) : null}
            <CandidateButtonList>
              {officialCandidates.map((candidate) => {
                return (
                  <CandidateButton
                    key={candidate.id}
                    candidate={candidate}
                    isSelected={
                      currentWriteIn &&
                      currentWriteIn.status === 'adjudicated' &&
                      currentWriteIn.adjudicationType ===
                        'official-candidate' &&
                      currentWriteIn.candidateId === candidate.id
                    }
                    isSelectedStatusUpToDate={isWriteInAdjudicationContextFresh}
                    onSelect={() => adjudicateAsOfficialCandidate(candidate)}
                    onDeselect={resetAdjudication}
                  />
                );
              })}
            </CandidateButtonList>
            {showNewWriteInCandidateForm || writeInCandidates.length > 0 ? (
              <SectionLabel>Write-In Candidates</SectionLabel>
            ) : null}
            {writeInCandidates.length > 0 && (
              <CandidateButtonList>
                {writeInCandidates.map((candidate) => {
                  return (
                    <CandidateButton
                      key={candidate.id}
                      candidate={candidate}
                      isSelected={
                        currentWriteIn &&
                        currentWriteIn.status === 'adjudicated' &&
                        currentWriteIn.adjudicationType ===
                          'write-in-candidate' &&
                        currentWriteIn.candidateId === candidate.id
                      }
                      isSelectedStatusUpToDate={
                        isWriteInAdjudicationContextFresh
                      }
                      onSelect={() => adjudicateAsWriteInCandidate(candidate)}
                      onDeselect={resetAdjudication}
                    />
                  );
                })}
              </CandidateButtonList>
            )}
            <div style={{ margin: '0.5rem 0' }}>
              {showNewWriteInCandidateForm ? (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    key={currentWriteInId}
                    value={newWriteInCandidateName ?? ''}
                    onChange={(e) => setNewWriteInCandidateName(e.target.value)}
                    data-testid="write-in-candidate-name-input"
                    aria-label="Candidate Name"
                    placeholder="Candidate Name"
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    onBlur={() => {
                      if (!newWriteInCandidateName) {
                        hideNewWriteInCandidateForm();
                      }
                    }}
                    onKeyDown={async (event) => {
                      if (event.key === 'Enter') {
                        await onAddWriteInCandidate();
                      }
                    }}
                    style={{ flexGrow: 1 }}
                  />
                  <Button
                    onPress={onAddWriteInCandidate}
                    variant="secondary"
                    disabled={
                      !newWriteInCandidateName ||
                      disallowedWriteInCandidateNames.includes(
                        normalizeWriteInName(newWriteInCandidateName)
                      )
                    }
                  >
                    Add
                  </Button>
                </div>
              ) : null}
            </div>
          </AdjudicationForm>
          <AdjudicationStickyFooter>
            <WriteInActionButton
              icon="Add"
              onPress={() => {
                if (isBmdWriteIn) {
                  setNewWriteInCandidateName(
                    writeInImageView.machineMarkedText
                  );
                }
                setShowNewWriteInCandidateForm(true);
              }}
            >
              Add new write-in candidate
            </WriteInActionButton>

            <WriteInActionButton
              onPress={() => {
                if (!isWriteInAdjudicationContextFresh) return;

                if (!currentWriteInMarkedInvalid) {
                  adjudicateAsInvalid();
                } else {
                  resetAdjudication();
                }
              }}
              variant={currentWriteInMarkedInvalid ? 'secondary' : 'neutral'}
              icon="Disabled"
            >
              Mark write-in as undervote
            </WriteInActionButton>

            <AdjudicationNav>
              <Button
                disabled={offset === 0}
                onPress={goPrevious}
                icon="Previous"
              >
                Previous
              </Button>
              <Caption weight="semiBold" style={{ whiteSpace: 'nowrap' }}>
                {format.count(offset + 1)} of {format.count(totalWriteIns)}
              </Caption>
              {isLastAdjudication ? (
                <LinkButton
                  variant={
                    currentWriteIn?.status === 'adjudicated'
                      ? 'primary'
                      : 'neutral'
                  }
                  to={routerPaths.writeIns}
                  icon="Done"
                >
                  Finish
                </LinkButton>
              ) : (
                <Button
                  ref={nextButton}
                  variant={
                    currentWriteIn?.status === 'adjudicated'
                      ? 'primary'
                      : 'neutral'
                  }
                  rightIcon="Next"
                  onPress={goNext}
                >
                  Next
                </Button>
              )}
            </AdjudicationNav>
          </AdjudicationStickyFooter>
        </AdjudicationControls>
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
