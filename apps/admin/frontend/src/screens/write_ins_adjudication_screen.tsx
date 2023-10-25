import React, { useContext, useEffect, useRef, useState } from 'react';
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
  Icons,
  P,
  Font,
  Caption,
  LabelledText,
  H2,
  H4,
  LinkButton,
  Loading,
} from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { assert, find } from '@votingworks/basics';
import pluralize from 'pluralize';
import { useQueryClient } from '@tanstack/react-query';
import type {
  WriteInCandidateRecord,
  WriteInRecordAdjudicatedOfficialCandidate,
} from '@votingworks/admin-backend';
import { useParams } from 'react-router-dom';
import { ScreenHeader } from '../components/layout/screen_header';
import { InlineForm, TextInput } from '../components/text_input';
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
import { BallotImageViewer } from '../components/adjudication_ballot_image_viewer';
import {
  DoubleVoteAlert,
  DoubleVoteAlertModal,
} from '../components/adjudication_double_vote_alert_modal';

const AdjudicationScreen = styled(Screen)`
  /* Matches the focus style applied in libs/ui/global_styles.tsx, which are
   * disabled by default in VxAdmin and enabled on the touch-only VxSuite
   * machines.
   * TODO: We should probably figure out a more consistent approach to
   * enabling/disabling focus outlines across a single app, instead of
   * conditionally enabling on certain pages.
   */
  & *:focus {
    outline: ${(p) => p.theme.colors.accentPrimary} dashed
      ${(p) => p.theme.sizes.bordersRem.medium}rem;
  }
`;

const AdjudicationHeader = styled.div`
  align-items: center;
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.foreground};
  display: flex;
  gap: 1rem;
  padding: 0.5rem;
`;

const ContestTitleContainer = styled.div`
  display: flex;
  flex-grow: 1;
`;

const ContestTitle = styled(H2)`
  display: flex;
  flex-direction: column;
  font-size: 1.2rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.regular};

  /*
   * Override heading styling.
   * TODO: Update shared heading components to omit margins when heading is the
   * last/only child in its container.
   */
  margin: 0 !important;
`;

const AdjudicationNav = styled.div`
  align-items: center;
  display: flex;
  gap: 0.5rem;
`;

const BallotViews = styled.div`
  background: ${(p) => p.theme.colors.foreground};
  padding: 0 0.5rem;
  width: 75vw;
`;

const AdjudicationControls = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
`;

const AdjudicationForm = styled.div`
  overflow: scroll;
  padding: 0.5rem;
`;

const TranscribedButtons = styled.div`
  display: grid;
  grid-gap: max(${(p) => p.theme.sizes.minTouchAreaSeparationPx}px, 0.25rem);
  grid-template-columns: 1fr;

  &:not(:last-child) {
    margin-bottom: 0.5rem;
  }

  & button {
    text-align: left;
  }
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
  const newWriteInCandidateInput = useRef<HTMLInputElement>(null);
  const nextButton = useRef<Button>(null);
  const firstAdjudicationButton = useRef<Button>(null);

  if (
    !writeInQueueMetadataQuery.isSuccess ||
    !writeInQueueQuery.isSuccess ||
    !writeInCandidatesQuery.isSuccess ||
    !firstPendingWriteInIdQuery.isSuccess ||
    !initialOffsetSet ||
    !currentWriteInId
  ) {
    return (
      <AdjudicationScreen>
        <ScreenHeader
          title="Write-In Adjudication"
          actions={
            <LinkButton small variant="neutral" to={routerPaths.writeIns}>
              Back to All Write-Ins
            </LinkButton>
          }
        />
        <Loading isFullscreen />
      </AdjudicationScreen>
    );
  }

  const totalWriteIns = writeInQueueMetadataQuery.data[0].totalTally;
  const isLastAdjudication = offset >= totalWriteIns - 1;
  const adjudicationsLeft = writeInQueueMetadataQuery.data[0].pendingTally;
  const areAllWriteInsAdjudicated = adjudicationsLeft === 0;

  const officialCandidates = [...contest.candidates]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((candidate) => !candidate.isWriteIn);
  const writeInCandidates = writeInCandidatesQuery.data;
  const disallowedWriteInCandidateNames = [
    '',
    ...officialCandidates.map((c) => normalizeWriteInName(c.name)),
    ...writeInCandidates.map((c) => normalizeWriteInName(c.name)),
  ];

  const writeInImageView = writeInImageViewQuery.data;
  const writeInAdjudicationContext = writeInAdjudicationContextQuery.data;
  const currentWriteIn = writeInAdjudicationContext?.writeIn;
  const currentWriteInMarkedInvalid =
    currentWriteIn &&
    currentWriteIn.status === 'adjudicated' &&
    currentWriteIn.adjudicationType === 'invalid';

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

  function goPrevious() {
    setOffset((v) => v - 1);
    setShowNewWriteInCandidateForm(false);
  }
  function goNext() {
    setOffset((v) => v + 1);
    setShowNewWriteInCandidateForm(false);
    nextButton.current?.blur();
    firstAdjudicationButton.current?.focus();
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

  async function onAddWriteInCandidate() {
    const name = newWriteInCandidateInput.current?.value;
    assert(currentWriteInId !== undefined);
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
      setShowNewWriteInCandidateForm(false);
    } catch (error) {
      // Handled by default query client error handling
    }
  }
  function hideAddNewWriteInCandidateWhenEmpty() {
    if (
      !newWriteInCandidateInput.current ||
      newWriteInCandidateInput.current.value === ''
    ) {
      setShowNewWriteInCandidateForm(false);
    }
  }

  return (
    <AdjudicationScreen>
      <ScreenHeader
        title="Write-In Adjudication"
        actions={
          <React.Fragment>
            <span>
              {areAllWriteInsAdjudicated
                ? 'No further write-ins to transcribe for this contest.'
                : `${format.count(adjudicationsLeft)} ${pluralize(
                    'write-in',
                    adjudicationsLeft
                  )} to adjudicate.`}
            </span>
            <LinkButton
              small
              variant={areAllWriteInsAdjudicated ? 'primary' : 'neutral'}
              to={routerPaths.writeIns}
            >
              Back to All Write-Ins
            </LinkButton>
          </React.Fragment>
        }
      />
      <AdjudicationHeader>
        <ContestTitleContainer>
          <ContestTitle>
            <Caption>{getContestDistrictName(election, contest)}</Caption>
            <span>
              {contest.title}
              {contest.partyId &&
                ` (${getPartyAbbreviationByPartyId({
                  partyId: contest.partyId,
                  election,
                })})`}
            </span>
          </ContestTitle>
        </ContestTitleContainer>
        <LabelledText label="Ballot ID">
          <Font weight="bold">
            {writeInImageView ? writeInImageView.cvrId.substring(0, 4) : '-'}
          </Font>
        </LabelledText>
        <LabelledText label="Adjudication ID">
          <Font weight="bold">{currentWriteInId.substring(0, 4)}</Font>
        </LabelledText>
        <AdjudicationNav>
          <Button disabled={offset === 0} onPress={goPrevious} icon="Previous">
            Previous
          </Button>
          <Caption weight="semiBold">
            {format.count(offset + 1)} of {format.count(totalWriteIns)}
          </Caption>
          <Button
            ref={nextButton}
            variant={
              currentWriteIn?.status === 'adjudicated' ? 'primary' : 'neutral'
            }
            rightIcon="Next"
            disabled={isLastAdjudication}
            onPress={goNext}
          >
            Next
          </Button>
        </AdjudicationNav>
      </AdjudicationHeader>
      <Main flexRow data-testid={`transcribe:${currentWriteInId}`}>
        <BallotViews>
          {writeInImageView ? (
            <BallotImageViewer
              key={currentWriteInId} // Reset zoom state for each write-in
              imageUrl={writeInImageView.imageUrl}
              ballotBounds={writeInImageView.ballotCoordinates}
              writeInBounds={writeInImageView.writeInCoordinates}
            />
          ) : null}
        </BallotViews>
        <AdjudicationControls>
          <AdjudicationForm>
            <div>
              <H4 as="h3">Official Candidates</H4>
              <TranscribedButtons>
                {officialCandidates.map((candidate, i) => {
                  const isCurrentAdjudication =
                    currentWriteIn &&
                    currentWriteIn.status === 'adjudicated' &&
                    currentWriteIn.adjudicationType === 'official-candidate' &&
                    currentWriteIn.candidateId === candidate.id;
                  return (
                    <Button
                      key={candidate.id}
                      ref={i === 0 ? firstAdjudicationButton : undefined}
                      variant={isCurrentAdjudication ? 'secondary' : 'neutral'}
                      onPress={() => {
                        if (
                          isWriteInAdjudicationContextFresh &&
                          !isCurrentAdjudication
                        ) {
                          adjudicateAsOfficialCandidate(candidate);
                        }
                      }}
                    >
                      {candidate.name}
                    </Button>
                  );
                })}
              </TranscribedButtons>
              <H4 as="h3">Write-In Candidates</H4>
              <TranscribedButtons>
                {writeInCandidates.map((candidate) => {
                  const isCurrentAdjudication =
                    currentWriteIn &&
                    currentWriteIn.status === 'adjudicated' &&
                    currentWriteIn.adjudicationType === 'write-in-candidate' &&
                    currentWriteIn.candidateId === candidate.id;
                  return (
                    <Button
                      key={candidate.id}
                      variant={isCurrentAdjudication ? 'secondary' : 'neutral'}
                      onPress={() => {
                        if (
                          isWriteInAdjudicationContextFresh &&
                          !isCurrentAdjudication
                        ) {
                          adjudicateAsWriteInCandidate(candidate);
                        }
                      }}
                    >
                      {candidate.name}
                    </Button>
                  );
                })}
              </TranscribedButtons>
              <P>
                {showNewWriteInCandidateForm ? (
                  <InlineForm as="span">
                    <TextInput
                      ref={newWriteInCandidateInput}
                      placeholder="Candidate Name"
                      autoFocus
                      onBlur={hideAddNewWriteInCandidateWhenEmpty}
                      onKeyDown={async (event) => {
                        if (event.key === 'Enter') {
                          await onAddWriteInCandidate();
                        }
                      }}
                    />
                    <Button
                      onPress={onAddWriteInCandidate}
                      variant="secondary"
                      disabled={
                        !!newWriteInCandidateInput.current &&
                        disallowedWriteInCandidateNames.includes(
                          normalizeWriteInName(
                            newWriteInCandidateInput.current.value
                          )
                        )
                      }
                    >
                      Add
                    </Button>
                  </InlineForm>
                ) : (
                  <Button onPress={() => setShowNewWriteInCandidateForm(true)}>
                    <Icons.Add /> Add new write-in candidate
                  </Button>
                )}
              </P>
              <Button
                onPress={() => {
                  if (
                    isWriteInAdjudicationContextFresh &&
                    !currentWriteInMarkedInvalid
                  ) {
                    adjudicateAsInvalid();
                  }
                }}
                variant={currentWriteInMarkedInvalid ? 'secondary' : 'neutral'}
              >
                <Icons.DangerX /> Mark write-in invalid
              </Button>
            </div>
          </AdjudicationForm>
        </AdjudicationControls>
        {doubleVoteAlert && (
          <DoubleVoteAlertModal
            doubleVoteAlert={doubleVoteAlert}
            onClose={() => setDoubleVoteAlert(undefined)}
          />
        )}
      </Main>
    </AdjudicationScreen>
  );
}
