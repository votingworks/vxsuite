import React, { useRef, useState } from 'react';
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
import { Navigation } from '../components/navigation';
import { InlineForm, TextInput } from '../components/text_input';
import { getWriteInImage } from '../api';

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

// The image is scaled via the `width` attribute (applied where this component
// is rendered.)
//
// With this CSS, we move the image to either center the write-in area
// on screen (if zoomed in) or make sure the whole image fits on screen (if
// zoomed out). In mid-zoom, we try to position the image somewhere in between
// those two extremes.
const ZoomedBallotImage = styled.img<{
  focusBounds: Rect;
  scale: number;
  zoom: number;
}>`
  position: absolute;
  top: calc(
    (
        50% -
          ${(props) =>
            (props.focusBounds.y + props.focusBounds.height / 2) *
            props.scale}px
      ) * ${(props) => props.zoom}
  );
  left: calc(
    (
        50% -
          ${(props) =>
            (props.focusBounds.x + props.focusBounds.width / 2) * props.scale}px
      ) * ${(props) => props.zoom}
  );
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
  opacity: 0.5;
  z-index: 1;
  background: #000000;
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

const BallotImageViewerControls = styled.div`
  display: flex;
  position: absolute;
  top: 0;
  right: 0;
  z-index: 2;
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
  // Zoom is a value between 0 and 1, where 0 is zoomed out all the way and 1 is
  // zoomed in all the way.
  const MIN_ZOOM = 0;
  const MAX_ZOOM = 1;
  // For now, we only support zooming all the way in or out, since the current
  // zooming algorithm isn't smart enough to keep the write-in area focused
  // while zooming and also make sure that zooming out completely shows the
  // whole ballot. I think it's kind of a hard problem and might be better
  // solved by allowing zooming and panning.
  const ZOOM_STEP = 1;
  const [zoom, setZoom] = useState(MAX_ZOOM);

  // Scale is the factor to scale the image (or coordinates within it) based on
  // the current zoom level. It's basically the zoom setting applied to the
  // image size.
  const IMAGE_SCALE = 0.5; // The images are downscaled by 50% during CVR export, this is to adjust for that.
  const MIN_SCALE = IMAGE_SCALE;
  const MAX_SCALE = (ballotBounds.width / writeInBounds.width) * IMAGE_SCALE;
  const scale = MIN_SCALE + (MAX_SCALE - MIN_SCALE) * zoom;

  return (
    <BallotImageViewerContainer>
      {zoom === 1 && (
        <WriteInFocusOverlay
          focusWidth={writeInBounds.width * scale}
          focusHeight={writeInBounds.height * scale}
        />
      )}
      <ZoomedBallotImage
        src={imageUrl}
        width={ballotBounds.width * scale}
        focusBounds={writeInBounds}
        scale={scale}
        zoom={zoom}
      />
      <BallotImageViewerControls>
        <Button
          onPress={() => setZoom((prevZoom) => prevZoom - ZOOM_STEP)}
          disabled={zoom - ZOOM_STEP < MIN_ZOOM}
        >
          <Icons.ZoomOut /> Zoom Out
        </Button>
        <Button
          onPress={() => setZoom((prevZoom) => prevZoom + ZOOM_STEP)}
          disabled={zoom + ZOOM_STEP > MAX_ZOOM}
        >
          <Icons.ZoomIn /> Zoom In
        </Button>
      </BallotImageViewerControls>
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
  const imageDataQuery = getWriteInImage.useQuery({
    writeInId: currentAdjudication.id,
  });
  const imageData = imageDataQuery.data ? imageDataQuery.data[0] : undefined;

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
          {imageData && (
            <BallotImageViewer
              imageUrl={`data:image/png;base64,${imageData.image}`}
              ballotBounds={imageData.ballotCoordinates}
              writeInBounds={imageData.writeInCoordinates}
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
