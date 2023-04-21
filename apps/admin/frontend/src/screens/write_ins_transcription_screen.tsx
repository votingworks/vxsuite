import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import {
  Adjudication,
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
import { getWriteInImageView, useApiClient } from '../api';

const BallotViews = styled.div`
  flex: 3;
  background: #455a64;
  padding: 0 0.5rem;
`;

const TranscriptionControls = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  border-left: 1px solid #cccccc;
  button:focus {
    outline: 1px dashed #000000;
  }
`;

const TranscriptionPagination = styled.div`
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

const TranscriptionHeader = styled.div`
  border-bottom: 1px solid #cccccc;
  background: #ffffff;
  width: 100%;
  padding: 0.5rem 1rem;
  p + h1 {
    margin-top: 0;
  }
`;

const TranscriptionId = styled.p`
  float: right;
  text-align: right;
  & > strong {
    font-size: 1.5em;
  }
`;

const TranscriptionForm = styled.div`
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
  adjudications: readonly Adjudication[];
  transcriptionQueue: number;
  onClose: () => void;
  saveTranscribedValue: (
    adjudicationId: string,
    transcribedValue: string
  ) => void;
}

export function WriteInsTranscriptionScreen({
  contest,
  election,
  adjudications,
  transcriptionQueue,
  onClose,
  saveTranscribedValue,
}: Props): JSX.Element {
  assert(contest);
  assert(election);

  const transcribedValueInput = useRef<HTMLInputElement>(null);
  const nextButton = useRef<Button>(null);
  const firstTranscriptionButton = useRef<Button>(null);

  function getTranscribedValues(
    adjudicationSet: readonly Adjudication[]
  ): Set<string> {
    return new Set(
      adjudicationSet
        .map(({ transcribedValue }) => transcribedValue)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
    );
  }

  const previouslyTranscribedValues = getTranscribedValues(adjudications);
  const [cannedTranscriptions, setCannedTranscriptions] = useState(
    previouslyTranscribedValues
  );

  const [showNewTranscriptionForm, setShowNewTranscriptionForm] = useState(
    !cannedTranscriptions.size
  );

  const [offset, setOffset] = useState(0);
  function goPrevious() {
    setCannedTranscriptions(getTranscribedValues(adjudications));
    setOffset((v) => v - 1);
    setShowNewTranscriptionForm(false);
  }
  function goNext() {
    setCannedTranscriptions(getTranscribedValues(adjudications));
    setOffset((v) => v + 1);
    setShowNewTranscriptionForm(false);
    nextButton.current?.blur();
    firstTranscriptionButton.current?.focus();
  }
  const currentAdjudication = adjudications[offset];
  const currentTranscribedValue = currentAdjudication.transcribedValue;
  const adjudicationId = currentAdjudication.id;

  function onPressSetTranscribedValue(val: string): void {
    saveTranscribedValue(adjudicationId, val);
    setTimeout(() => {
      nextButton.current?.focus();
    }, 0);
  }
  function hideAddNewTranscriptionWhenEmpty() {
    const val = transcribedValueInput.current?.value || '';
    if (val === '') {
      setShowNewTranscriptionForm(false);
    }
  }
  const writeInImageViewQuery = getWriteInImageView.useQuery({
    writeInId: currentAdjudication.id,
  });
  const writeInImageView = writeInImageViewQuery.data
    ? writeInImageViewQuery.data
    : undefined;

  // prefetch the next write-in image
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  useEffect(() => {
    const nextAdjudication = adjudications[offset + 1];
    if (nextAdjudication) {
      void queryClient.prefetchQuery({
        queryKey: getWriteInImageView.queryKey({
          writeInId: nextAdjudication.id,
        }),
        queryFn: () =>
          getWriteInImageView.queryFn(
            { writeInId: nextAdjudication.id },
            apiClient
          ),
      });
    }
  }, [adjudications, apiClient, offset, queryClient]);

  function onSave() {
    const val = transcribedValueInput.current?.value || '';
    onPressSetTranscribedValue(val);
    if (val !== '') {
      setCannedTranscriptions(
        (prev) => new Set([...prev, val].sort((a, b) => a.localeCompare(b)))
      );
    }

    setShowNewTranscriptionForm(false);
  }

  const isLastTranscription = offset >= adjudications.length - 1;
  const isEmptyTranscriptionQueue = transcriptionQueue === 0;

  return (
    <Screen>
      <Navigation
        screenTitle="Write-In Transcription"
        secondaryNav={
          <React.Fragment>
            <Text as="span">
              {isEmptyTranscriptionQueue
                ? 'No further write-ins to transcribe for this contest.'
                : `${format.count(transcriptionQueue)} ${pluralize(
                    'write-in',
                    transcriptionQueue
                  )} to transcribe.`}
            </Text>
            <Button
              small
              variant={isEmptyTranscriptionQueue ? 'primary' : 'regular'}
              onPress={onClose}
            >
              Back to All Write-Ins
            </Button>
          </React.Fragment>
        }
      />
      <Main flexRow data-testid={`transcribe:${adjudicationId}`}>
        <BallotViews>
          {writeInImageView && (
            <BallotImageViewer
              key={adjudicationId} // Reset zoom state for each write-in
              imageUrl={writeInImageView.imageUrl}
              ballotBounds={writeInImageView.ballotCoordinates}
              writeInBounds={writeInImageView.writeInCoordinates}
            />
          )}
        </BallotViews>
        <TranscriptionControls>
          <TranscriptionPagination>
            <Button disabled={offset === 0} onPress={goPrevious}>
              Previous
            </Button>
            <Text center>
              {format.count(offset + 1)} of {format.count(adjudications.length)}
            </Text>
            <Button
              ref={nextButton}
              variant={currentTranscribedValue ? 'primary' : 'regular'}
              disabled={isLastTranscription}
              onPress={goNext}
            >
              Next
            </Button>
          </TranscriptionPagination>
          <TranscriptionHeader>
            <Prose compact>
              <TranscriptionId>
                Transcription ID
                <br />
                <strong>{adjudicationId.substring(0, 4)}</strong>
              </TranscriptionId>
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
          </TranscriptionHeader>
          <TranscriptionForm>
            <Prose>
              {!!cannedTranscriptions.size && (
                <React.Fragment>
                  <TranscribedButtons>
                    {[...cannedTranscriptions].map((val, i) => (
                      <Button
                        key={val}
                        ref={i === 0 ? firstTranscriptionButton : undefined}
                        variant={
                          val === currentTranscribedValue
                            ? 'secondary'
                            : 'regular'
                        }
                        onPress={() => onPressSetTranscribedValue(val)}
                      >
                        {val}
                      </Button>
                    ))}
                  </TranscribedButtons>
                  <HorizontalRule color="#cccccc" />
                </React.Fragment>
              )}
              <p>
                {showNewTranscriptionForm ? (
                  <InlineForm as="span">
                    <TextInput
                      ref={transcribedValueInput}
                      placeholder="transcribed write-in"
                      autoFocus
                      onBlur={hideAddNewTranscriptionWhenEmpty}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          onSave();
                        }
                      }}
                    />
                    <Button onPress={onSave} variant="secondary">
                      Add
                    </Button>
                  </InlineForm>
                ) : (
                  <Button onPress={() => setShowNewTranscriptionForm(true)}>
                    Add new transcription
                  </Button>
                )}
              </p>
            </Prose>
          </TranscriptionForm>
        </TranscriptionControls>
      </Main>
    </Screen>
  );
}
