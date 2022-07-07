/* eslint-disable no-underscore-dangle */
import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import {
  Adjudication,
  AdjudicationId,
  CandidateContest,
  Election,
  Rect,
  getPartyAbbreviationByPartyId,
  CastVoteRecord,
  getContests,
  getBallotStyle,
  BallotPageLayout,
  InlineBallotImage,
} from '@votingworks/types';
import { Button, Loading, Main, Screen, Text } from '@votingworks/ui';
import { assert, zip } from '@votingworks/utils';
import { Navigation } from '../components/navigation';
import { TextInput } from '../components/text_input';
import { CroppedImage } from '../components/cropped_image';

const BallotPreviews = styled.div`
  flex: 3;
  padding: 1rem;
`;

const TranscriptionContainer = styled.div`
  display: flex;
  flex: 2;
  flex-direction: column;
  border-left: 1px solid #cccccc;
`;

const TranscriptionMainContentContainer = styled.div`
  flex: 1;
  overflow: scroll;
  padding: 1rem;
`;

const PreviouslyTranscribedValuesContainer = styled.div``;

const PreviouslyTranscribedValueButtonWrapper = styled.div`
  display: inline-block;
  margin: 0.5rem 0.5rem 0 0;
`;

const TranscriptionPaginationContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #cccccc;
  background: #ffffff;
  width: 100%;
  padding: 0.5rem 1rem;
`;

/* istanbul ignore next */
function noop() {
  // nothing to do
}

const DEFAULT_EXTRA_WRITE_IN_MARGIN_PERCENTAGE = 0;
function WriteInImage({
  imageUrl,
  bounds,
  width,
  margin,
}: {
  imageUrl: string;
  bounds: Rect;
  width?: string;
  margin?: number;
}) {
  return (
    <CroppedImage
      src={imageUrl}
      alt="write-in area"
      crop={{
        x: bounds.x,
        y:
          bounds.y -
          bounds.height * (margin || DEFAULT_EXTRA_WRITE_IN_MARGIN_PERCENTAGE),
        width: bounds.width,
        height:
          bounds.height *
          (1 + 2 * (margin || DEFAULT_EXTRA_WRITE_IN_MARGIN_PERCENTAGE)),
      }}
      style={{ width: width || '100%' }}
    />
  );
}

export function WriteInsTranscriptionScreen({
  contest,
  election,
  adjudications,
  paginationIdx,
  onClickNext,
  onClickPrevious,
  onClose,
  onListAll,
  saveTranscribedValue,
}: {
  contest: CandidateContest;
  election: Election;
  adjudications: readonly Adjudication[];
  paginationIdx: number;
  onClickNext?: () => void;
  onClickPrevious?: () => void;
  onClose: () => void;
  onListAll: () => void;
  saveTranscribedValue: (
    adjudicationId: string,
    transcribedValue: string
  ) => void;
}): JSX.Element {
  const [currentTranscribedValue, setCurrentTranscribedValue] = useState('');
  const [isTranscribedValueInputVisible, setIsTranscribedValueInputVisible] =
    useState(false);
  const [previouslyTranscribedValues, setPreviouslyTranscribedValues] =
    useState<string[]>([]);

  const transcribedValueInput = useRef<HTMLInputElement>(null);
  const [cvr, setCvr] = useState<CastVoteRecord>();

  assert(contest);
  assert(election);

  const currentAdjudication = adjudications[paginationIdx];
  const adjudicationId = currentAdjudication.id;

  function onPressSetTranscribedValue(val: string): void {
    setCurrentTranscribedValue(val);
    saveTranscribedValue(adjudicationId, val);
  }

  useEffect(() => {
    async function fetchCvr() {
      const resp = await fetch(
        `/admin/write-ins/adjudication/${adjudicationId}/cvr`
      );
      const json = await resp.json();
      setCvr(JSON.parse(json.data) as CastVoteRecord);
    }
    void fetchCvr();
  }, [adjudicationId]);

  useEffect(() => {
    async function getTranscribedValue(id: AdjudicationId): Promise<void> {
      const res = await fetch(`/admin/write-ins/adjudication/${id}`);
      try {
        const { transcribedValue } = await res.json();
        setCurrentTranscribedValue(transcribedValue);
      } catch {
        setCurrentTranscribedValue('');
      }
    }
    void getTranscribedValue(adjudicationId || '');
  }, [adjudicationId]);

  useEffect(() => {
    async function getPreviouslyTranscribedValues(): Promise<void> {
      const res = await fetch('/admin/write-ins/transcribed-values');
      setPreviouslyTranscribedValues(await res.json());
    }
    void getPreviouslyTranscribedValues();
  }, []);

  if (cvr === undefined) {
    return (
      <Screen>
        <Navigation
          screenTitle="Write-In Adjudication"
          secondaryNav={
            <React.Fragment>
              <Button small onPress={onListAll}>
                List All
              </Button>
              <Button small onPress={onClose}>
                Exit
              </Button>
            </React.Fragment>
          }
        />
        <Loading />
      </Screen>
    );
  }
  assert(cvr !== undefined);
  const ballotStyle = getBallotStyle({
    ballotStyleId: cvr._ballotStyleId,
    election,
  });
  assert(ballotStyle);
  const allContestIdsForBallotStyle = getContests({
    ballotStyle,
    election,
  }).map((c) => c.id);
  // Make sure the layouts are ordered by page number.
  assert(cvr._layouts?.[0] && cvr._ballotImages);
  const [layouts, ballotImages] = [...zip(cvr._layouts[0], cvr._ballotImages)]
    .sort(([a], [b]) => a.metadata.pageNumber - b.metadata.pageNumber)
    .reduce<[BallotPageLayout[], InlineBallotImage[]]>(
      ([layoutsAcc, ballotImagesAcc], [layout, ballotImage]) => [
        [...layoutsAcc, layout],
        [...ballotImagesAcc, ballotImage],
      ],
      [[], []]
    );
  let contestIdx = allContestIdsForBallotStyle.indexOf(contest.id);
  let currentLayoutOptionIdx = 0;
  while (contestIdx >= layouts[currentLayoutOptionIdx].contests.length) {
    currentLayoutOptionIdx += 1;
    contestIdx -= layouts[currentLayoutOptionIdx].contests.length;
  }

  const contestLayout = layouts[currentLayoutOptionIdx].contests[contestIdx];

  // Options are laid out from the bottom up, so we reverse write-ins to get the correct bounds
  const writeInOptions = contestLayout.options
    .filter((option) => option.definition.id.startsWith('write-in'))
    .reverse();

  // eslint-disable-next-line
  const writeInOptionIndex = Number(
    cvr[contest.id]
      .find((vote: string) => vote.startsWith('write-in'))
      .slice('write-in-'.length)
  );
  const writeInLayout = writeInOptions[writeInOptionIndex];
  const writeInBounds = writeInLayout.bounds;
  const contestBounds = contestLayout.bounds;
  const fullBallotBounds: Rect = {
    ...layouts[currentLayoutOptionIdx].pageSize,
    x: 0,
    y: 0,
  };

  return (
    <Screen>
      <Navigation
        screenTitle="Write-In Adjudication"
        secondaryNav={
          <React.Fragment>
            <Button small onPress={onListAll}>
              List All
            </Button>
            <Button small onPress={onClose}>
              Exit
            </Button>
          </React.Fragment>
        }
      />
      <Main flexRow>
        <BallotPreviews>
          <h2>Write-In</h2>
          <WriteInImage
            width="50%"
            // eslint-disable-next-line
            imageUrl={`data:image/png;base64,${ballotImages[currentLayoutOptionIdx].normalized}`}
            bounds={writeInBounds}
            margin={0.2}
          />
          <div style={{ display: 'flex' }}>
            <div>
              <h2>Cropped Contest</h2>
              <WriteInImage
                // eslint-disable-next-line
                imageUrl={`data:image/png;base64,${ballotImages[currentLayoutOptionIdx].normalized}`}
                bounds={contestBounds}
                margin={0.1}
              />
            </div>
            <div>
              <h2>Full Ballot Image</h2>
              <WriteInImage
                // eslint-disable-next-line
                imageUrl={`data:image/png;base64,${ballotImages[currentLayoutOptionIdx].normalized}`}
                bounds={fullBallotBounds}
              />
            </div>
          </div>
        </BallotPreviews>
        <TranscriptionContainer>
          <TranscriptionMainContentContainer>
            {election && (
              <React.Fragment>
                <Text bold>{contest.section}</Text>
                <h1>
                  {contest.title}
                  {contest.partyId &&
                    `(${getPartyAbbreviationByPartyId({
                      partyId: contest.partyId,
                      election,
                    })})`}
                </h1>
                <h2>Adjudication ID: {adjudicationId}</h2>
              </React.Fragment>
            )}
            <PreviouslyTranscribedValuesContainer>
              {previouslyTranscribedValues.map((val) => (
                <PreviouslyTranscribedValueButtonWrapper key={val}>
                  <Button
                    primary={val === currentTranscribedValue}
                    onPress={() => onPressSetTranscribedValue(val)}
                  >
                    {val}
                  </Button>
                </PreviouslyTranscribedValueButtonWrapper>
              ))}
              <PreviouslyTranscribedValueButtonWrapper>
                <Button onPress={() => setIsTranscribedValueInputVisible(true)}>
                  Add new +
                </Button>
              </PreviouslyTranscribedValueButtonWrapper>
            </PreviouslyTranscribedValuesContainer>
            {isTranscribedValueInputVisible && (
              <React.Fragment>
                <Text>
                  <label htmlFor="transcription-value">Transcribed Value</label>
                  <TextInput
                    id="transcribed-value"
                    ref={transcribedValueInput}
                    name="transcribed-value"
                  />
                </Text>
                <Button
                  onPress={() => {
                    const val = transcribedValueInput.current?.value || '';
                    onPressSetTranscribedValue(val);
                    setPreviouslyTranscribedValues(
                      previouslyTranscribedValues.concat([val])
                    );
                    setIsTranscribedValueInputVisible(false);
                  }}
                >
                  Save
                </Button>
              </React.Fragment>
            )}
          </TranscriptionMainContentContainer>
          <TranscriptionPaginationContainer>
            <Button
              disabled={!onClickPrevious}
              onPress={onClickPrevious || noop}
            >
              Previous
            </Button>
            <Text bold>
              {paginationIdx + 1} of {adjudications.length}
            </Text>
            <Button disabled={!onClickNext} onPress={onClickNext || noop}>
              Next
            </Button>
          </TranscriptionPaginationContainer>
        </TranscriptionContainer>
      </Main>
    </Screen>
  );
}
