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
} from '@votingworks/types';
import { Button, Loading, Main, Screen, Text } from '@votingworks/ui';
import { assert } from '@votingworks/utils';
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

const EXTRA_WRITE_IN_MARGIN_PERCENTAGE = 0;
function WriteInImage({
  imageUrl,
  bounds,
  width,
}: {
  imageUrl: string;
  bounds: Rect;
  width?: string;
}) {
  return (
    <CroppedImage
      src={imageUrl}
      alt="write-in area"
      crop={{
        x: bounds.x,
        y: bounds.y - bounds.height * EXTRA_WRITE_IN_MARGIN_PERCENTAGE,
        width: bounds.width,
        height: bounds.height * (1 + 2 * EXTRA_WRITE_IN_MARGIN_PERCENTAGE),
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
  // eslint-disable-next-line
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
  const layouts = [...cvr._layouts[0]].sort(
    (a: BallotPageLayout, b: BallotPageLayout): number =>
      a.metadata.pageNumber - b.metadata.pageNumber
  );
  let contestIdx = allContestIdsForBallotStyle.indexOf(contest.id);
  let currentLayoutOptionIdx = 0;
  while (contestIdx >= layouts[currentLayoutOptionIdx].contests.length) {
    currentLayoutOptionIdx += 1;
    contestIdx -= layouts[currentLayoutOptionIdx].contests.length;
  }

  const contestLayout = layouts[currentLayoutOptionIdx].contests[contestIdx];
  // eslint-disable-next-line
  const writeInOptionIndex = Number(
    cvr[contest.id]
      .find((vote: string) => vote.startsWith('write-in'))
      .slice('write-in-'.length)
  );
  const writeInLayout =
    contestLayout.options[contest.candidates.length + writeInOptionIndex];
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
            imageUrl={`data:image/png;base64,${cvr._ballotImages[0].normalized}`}
            bounds={writeInBounds}
          />
          <div style={{ display: 'flex' }}>
            <div>
              <h2>Cropped Contest</h2>
              <WriteInImage
                // eslint-disable-next-line
                imageUrl={`data:image/png;base64,${cvr._ballotImages[0].normalized}`}
                bounds={contestBounds}
              />
            </div>
            <div>
              <h2>Full Ballot Image</h2>
              <WriteInImage
                // eslint-disable-next-line
                imageUrl={`data:image/png;base64,${cvr._ballotImages[0].normalized}`}
                bounds={fullBallotBounds}
              />
            </div>
          </div>
        </BallotPreviews>
        <TranscriptionContainer>
          <TranscriptionMainContentContainer>
            {election && contest.partyId && (
              <React.Fragment>
                <Text bold>{contest.section}</Text>
                <h1>
                  {contest.title} (
                  {getPartyAbbreviationByPartyId({
                    partyId: contest.partyId,
                    election,
                  })}
                  )
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
