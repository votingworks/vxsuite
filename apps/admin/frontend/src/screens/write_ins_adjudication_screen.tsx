import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import {
  CandidateContest,
  Election,
  getContestDistrictName,
  getPartyAbbreviationByPartyId,
  Rect,
} from '@votingworks/types';
import {
  Button,
  Main,
  Screen,
  Text,
  Prose,
  HorizontalRule,
  Icons,
} from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import pluralize from 'pluralize';
import { useQueryClient } from '@tanstack/react-query';
import { Navigation } from '../components/navigation';
import { InlineForm, TextInput } from '../components/text_input';
import {
  getWriteInImageView,
  getWriteIns,
  getWriteInCandidates,
  adjudicateWriteIn,
  useApiClient,
  addWriteInCandidate,
} from '../api';

const BallotViews = styled.div`
  flex: 3;
  background: #455a64;
  padding: 0 0.5rem;
`;

const AdjudicationControls = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  border-left: 1px solid #cccccc;
  button:focus {
    outline: 1px dashed #000000;
  }
`;

const AdjudicationPagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #cccccc;
  background: #ffffff;
  width: 100%;
  padding: 0.5rem 1rem;
  button {
    flex: 1;
  }
  p {
    flex: 2;
    margin: 0;
  }
`;

const AdjudicationHeader = styled.div`
  border-bottom: 1px solid #cccccc;
  background: #ffffff;
  width: 100%;
  padding: 0.5rem 1rem;
  p + h1 {
    margin-top: 0;
  }
`;

const AdjudicationId = styled.p`
  float: right;
  text-align: right;
  & > strong {
    font-size: 1.5em;
  }
`;

const AdjudicationForm = styled.div`
  overflow: scroll;
  padding: 1rem;
`;

const TranscribedButtons = styled.div`
  margin-bottom: -0.5rem;
  button {
    margin: 0 0.5rem 0.5rem 0;
  }
`;

const BallotImageViewerContainer = styled.div`
  position: relative;
  height: 100%;
  overflow: hidden;
`;

// We zoom in by scaling (setting the width) and then translating to center the
// write-in on the screen (setting the top/left position).
const ZoomedInBallotImage = styled.img<{
  ballotBounds: Rect;
  writeInBounds: Rect;
  scale: number;
}>`
  position: absolute;
  top: calc(
    (
      50% -
        ${(props) =>
          (props.writeInBounds.y + props.writeInBounds.height / 2) *
          props.scale}px
    )
  );
  left: calc(
    (
      50% -
        ${(props) =>
          (props.writeInBounds.x + props.writeInBounds.width / 2) *
          props.scale}px
    )
  );
  width: ${(props) => props.ballotBounds.width * props.scale}px;
`;

// We want to create a transparent overlay with a centered rectangle cut out of
// it of the size of the write-in area. There's not a super easy way to do this
// in CSS. Based on an idea from https://css-tricks.com/cutouts/, I used this
// tool to design the clipping path, https://bennettfeely.com/clippy/, and then
// parameterized it with the focus area width and height.
const WriteInFocusOverlay = styled.div<{
  focusWidth: number;
  focusHeight: number;
}>`
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  background: rgba(0, 0, 0, 0.5);
  width: 100%;
  height: 100%;
  clip-path: polygon(
    0% 0%,
    0% 100%,
    calc(50% - ${(props) => props.focusWidth / 2}px) 100%,
    calc(50% - ${(props) => props.focusWidth / 2}px)
      calc(50% - ${(props) => props.focusHeight / 2}px),
    calc(50% + ${(props) => props.focusWidth / 2}px)
      calc(50% - ${(props) => props.focusHeight / 2}px),
    calc(50% + ${(props) => props.focusWidth / 2}px)
      calc(50% + ${(props) => props.focusHeight / 2}px),
    calc(50% - ${(props) => props.focusWidth / 2}px)
      calc(50% + ${(props) => props.focusHeight / 2}px),
    calc(50% - ${(props) => props.focusWidth / 2}px) 100%,
    100% 100%,
    100% 0%
  );
`;

// Full-width image with vertical scrolling.
const ZoomedOutBallotImageContainer = styled.div`
  height: 100%;
  overflow-y: scroll;
  img {
    width: 100%;
  }
`;

const BallotImageViewerControls = styled.div<{ isZoomedIn: boolean }>`
  display: flex;
  justify-content: flex-end;
  position: absolute;
  top: 0;
  z-index: 2;
  background: ${(props) => (!props.isZoomedIn ? 'rgba(0, 0, 0, 0.5)' : 'none')};
  width: 100%;
  padding: 0.5rem;
  gap: 0.5rem;
`;

function BallotImageViewer({
  imageUrl,
  ballotBounds,
  writeInBounds,
}: {
  imageUrl: string;
  ballotBounds: Rect;
  writeInBounds: Rect;
}) {
  const [isZoomedIn, setIsZoomedIn] = useState(true);

  const IMAGE_SCALE = 0.5; // The images are downscaled by 50% during CVR export, this is to adjust for that.
  const zoomedInScale =
    (ballotBounds.width / writeInBounds.width) * IMAGE_SCALE;

  return (
    <BallotImageViewerContainer>
      <BallotImageViewerControls isZoomedIn={isZoomedIn}>
        <Button onPress={() => setIsZoomedIn(false)} disabled={!isZoomedIn}>
          <Icons.ZoomOut /> Zoom Out
        </Button>
        <Button onPress={() => setIsZoomedIn(true)} disabled={isZoomedIn}>
          <Icons.ZoomIn /> Zoom In
        </Button>
      </BallotImageViewerControls>
      {isZoomedIn ? (
        <React.Fragment>
          <WriteInFocusOverlay
            focusWidth={writeInBounds.width * zoomedInScale}
            focusHeight={writeInBounds.height * zoomedInScale}
          />
          <ZoomedInBallotImage
            src={imageUrl}
            alt="Ballot with write-in highlighted"
            ballotBounds={ballotBounds}
            writeInBounds={writeInBounds}
            scale={zoomedInScale}
          />
        </React.Fragment>
      ) : (
        <ZoomedOutBallotImageContainer>
          <img src={imageUrl} alt="Full ballot" />
        </ZoomedOutBallotImageContainer>
      )}
    </BallotImageViewerContainer>
  );
}

interface Props {
  contest: CandidateContest;
  election: Election;
  onClose: () => void;
}

export function WriteInsAdjudicationScreen({
  contest,
  election,
  onClose,
}: Props): JSX.Element | null {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  const writeInsQuery = getWriteIns.useQuery({ contestId: contest.id });
  const writeInCandidatesQuery = getWriteInCandidates.useQuery({
    contestId: contest.id,
  });
  const adjudicateWriteInMutation = adjudicateWriteIn.useMutation();
  const addWriteInCandidateMutation = addWriteInCandidate.useMutation();

  const [offset, setOffset] = useState(0);
  const currentWriteIn = writeInsQuery.data
    ? writeInsQuery.data[offset]
    : undefined;
  const writeInImageViewQuery = getWriteInImageView.useQuery(
    {
      writeInId: currentWriteIn?.id ?? 'no-op',
    },
    !!currentWriteIn
  );

  const [showNewWriteInCandidateForm, setShowNewWriteInCandidateForm] =
    useState(false);
  const newWriteInCandidateInput = useRef<HTMLInputElement>(null);
  const nextButton = useRef<Button>(null);
  const firstAdjudicationButton = useRef<Button>(null);

  // prefetch the next write-in image
  useEffect(() => {
    if (!writeInsQuery.data) return;
    const nextWriteIn = writeInsQuery.data[offset + 1];
    if (nextWriteIn) {
      void queryClient.prefetchQuery({
        queryKey: getWriteInImageView.queryKey({
          writeInId: nextWriteIn.id,
        }),
        queryFn: () =>
          getWriteInImageView.queryFn({ writeInId: nextWriteIn.id }, apiClient),
      });
    }
  }, [apiClient, queryClient, writeInsQuery.data, offset]);

  // as a modal, we can just return null
  if (
    !writeInsQuery.isSuccess ||
    !writeInCandidatesQuery.isSuccess ||
    !currentWriteIn
  ) {
    return null;
  }

  const writeInImageView = writeInImageViewQuery.data
    ? writeInImageViewQuery.data
    : undefined;

  const writeIns = writeInsQuery.data;
  const adjudicationsLeft = writeIns.reduce(
    (count, writeIn) => (writeIn.status === 'pending' ? count + 1 : count),
    0
  );
  const isLastAdjudication = offset >= writeIns.length - 1;
  const areAllWriteInsAdjudicated = adjudicationsLeft === 0;
  const currentWriteInMarkedInvalid =
    currentWriteIn.status === 'adjudicated' &&
    currentWriteIn.adjudicationType === 'invalid';

  const officialCandidates = [...contest.candidates]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((candidate) => !candidate.isWriteIn);
  const writeInCandidates = writeInCandidatesQuery.data;
  const disallowedWriteInCandidateNames = [
    '',
    ...officialCandidates.map((c) => c.name.toLowerCase()),
    ...writeInCandidates.map((c) => c.name.toLowerCase()),
  ];

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
  async function onAddWriteInCandidate() {
    const name = newWriteInCandidateInput.current?.value;
    assert(currentWriteIn);
    if (!name) return;
    if (disallowedWriteInCandidateNames.includes(name.toLowerCase())) return;

    try {
      const writeInCandidate = await addWriteInCandidateMutation.mutateAsync({
        contestId: contest.id,
        name,
      });
      adjudicateWriteInMutation.mutate({
        writeInId: currentWriteIn.id,
        type: 'write-in-candidate',
        candidateId: writeInCandidate.id,
      });
      focusNext();
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
    <Screen>
      <Navigation
        screenTitle="Write-In Adjudication"
        secondaryNav={
          <React.Fragment>
            <Text as="span">
              {areAllWriteInsAdjudicated
                ? 'No further write-ins to transcribe for this contest.'
                : `${format.count(adjudicationsLeft)} ${pluralize(
                    'write-in',
                    adjudicationsLeft
                  )} to adjudicate.`}
            </Text>
            <Button
              small
              variant={areAllWriteInsAdjudicated ? 'primary' : 'regular'}
              onPress={onClose}
            >
              Back to All Write-Ins
            </Button>
          </React.Fragment>
        }
      />
      <Main flexRow data-testid={`transcribe:${currentWriteIn.id}`}>
        <BallotViews>
          {writeInImageView && (
            <BallotImageViewer
              key={currentWriteIn.id} // Reset zoom state for each write-in
              imageUrl={writeInImageView.imageUrl}
              ballotBounds={writeInImageView.ballotCoordinates}
              writeInBounds={writeInImageView.writeInCoordinates}
            />
          )}
        </BallotViews>
        <AdjudicationControls>
          <AdjudicationPagination>
            <Button disabled={offset === 0} onPress={goPrevious}>
              Previous
            </Button>
            <Text center>
              {format.count(offset + 1)} of {format.count(writeIns.length)}
            </Text>
            <Button
              ref={nextButton}
              variant={
                currentWriteIn.status === 'adjudicated' ? 'primary' : 'regular'
              }
              disabled={isLastAdjudication}
              onPress={goNext}
            >
              Next
            </Button>
          </AdjudicationPagination>
          <AdjudicationHeader>
            <Prose compact>
              <AdjudicationId>
                Adjudication ID
                <br />
                <strong>{currentWriteIn.id.substring(0, 4)}</strong>
              </AdjudicationId>
              <Text>{getContestDistrictName(election, contest)}</Text>
              <h1>
                {contest.title}
                {contest.partyId &&
                  ` (${getPartyAbbreviationByPartyId({
                    partyId: contest.partyId,
                    election,
                  })})`}
              </h1>
            </Prose>
          </AdjudicationHeader>
          <AdjudicationForm>
            <Prose>
              <p>Official Candidates</p>
              <TranscribedButtons>
                {officialCandidates.map((candidate, i) => {
                  const isCurrentAdjudication =
                    currentWriteIn.status === 'adjudicated' &&
                    currentWriteIn.adjudicationType === 'official-candidate' &&
                    currentWriteIn.candidateId === candidate.id;
                  return (
                    <Button
                      key={candidate.id}
                      ref={i === 0 ? firstAdjudicationButton : undefined}
                      variant={isCurrentAdjudication ? 'secondary' : 'regular'}
                      onPress={() => {
                        if (!isCurrentAdjudication) {
                          adjudicateWriteInMutation.mutate({
                            writeInId: currentWriteIn.id,
                            type: 'official-candidate',
                            candidateId: candidate.id,
                          });
                          focusNext();
                        }
                      }}
                    >
                      {candidate.name}
                    </Button>
                  );
                })}
              </TranscribedButtons>
              <HorizontalRule color="#cccccc" />
              <p>Write-In Candidates</p>
              <TranscribedButtons>
                {writeInCandidates.map((candidate) => {
                  const isCurrentAdjudication =
                    currentWriteIn.status === 'adjudicated' &&
                    currentWriteIn.adjudicationType === 'write-in-candidate' &&
                    currentWriteIn.candidateId === candidate.id;
                  return (
                    <Button
                      key={candidate.id}
                      variant={isCurrentAdjudication ? 'secondary' : 'regular'}
                      onPress={() => {
                        if (!isCurrentAdjudication) {
                          adjudicateWriteInMutation.mutate({
                            writeInId: currentWriteIn.id,
                            type: 'write-in-candidate',
                            candidateId: candidate.id,
                          });
                          focusNext();
                        }
                      }}
                    >
                      {candidate.name}
                    </Button>
                  );
                })}
              </TranscribedButtons>
              <p>
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
                          newWriteInCandidateInput.current.value.toLowerCase()
                        )
                      }
                    >
                      Add
                    </Button>
                  </InlineForm>
                ) : (
                  <Button onPress={() => setShowNewWriteInCandidateForm(true)}>
                    Add New Write-In Candidate
                  </Button>
                )}
              </p>
              <HorizontalRule color="#cccccc" />
              <Button
                onPress={() => {
                  if (!currentWriteInMarkedInvalid) {
                    adjudicateWriteInMutation.mutate({
                      writeInId: currentWriteIn.id,
                      type: 'invalid',
                    });
                    focusNext();
                  }
                }}
                variant={currentWriteInMarkedInvalid ? 'secondary' : 'regular'}
              >
                Mark Write-In Invalid
              </Button>
            </Prose>
          </AdjudicationForm>
        </AdjudicationControls>
      </Main>
    </Screen>
  );
}
