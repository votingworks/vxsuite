import React, { useRef, useState } from 'react';
import styled from 'styled-components';

import {
  Adjudication,
  CandidateContest,
  Election,
  getPartyAbbreviationByPartyId,
} from '@votingworks/types';
import { Button, Main, Screen, Text } from '@votingworks/ui';
import { assert } from '@votingworks/utils';
import { Navigation } from '../components/navigation';
import { TextInput } from '../components/text_input';

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

interface Props {
  contest: CandidateContest;
  election: Election;
  adjudications: readonly Adjudication[];
  onClose: () => void;
  onListAll: () => void;
  saveTranscribedValue: (
    adjudicationId: string,
    transcribedValue: string
  ) => void;
}

export function WriteInsTranscriptionScreen({
  contest,
  election,
  adjudications,
  onClose,
  onListAll,
  saveTranscribedValue,
}: Props): JSX.Element {
  const [isTranscribedValueInputVisible, setIsTranscribedValueInputVisible] =
    useState(false);
  const [offset, setOffset] = useState(0);

  const transcribedValueInput = useRef<HTMLInputElement>(null);

  assert(contest);
  assert(election);

  const currentAdjudication = adjudications[offset];
  const currentTranscribedValue = currentAdjudication.transcribedValue;
  const adjudicationId = currentAdjudication.id;

  function onPressSetTranscribedValue(val: string): void {
    saveTranscribedValue(adjudicationId, val);
  }

  const previouslyTranscribedValues = new Set(
    adjudications
      .map(({ transcribedValue }) => transcribedValue)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
  );

  return (
    <Screen>
      <Navigation
        screenTitle="Write-In Transcription"
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
      <Main flexRow data-testid={`transcribe:${adjudicationId}`}>
        <BallotPreviews>BALLOT IMAGES GO HERE</BallotPreviews>
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
              {[...previouslyTranscribedValues].map((val) => (
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
              disabled={offset === 0}
              onPress={() => setOffset((prevOffset) => prevOffset - 1)}
            >
              Previous
            </Button>
            <Text bold>
              {offset + 1} of {adjudications.length}
            </Text>
            <Button
              disabled={offset >= adjudications.length - 1}
              onPress={() => setOffset((prevOffset) => prevOffset + 1)}
            >
              Next
            </Button>
          </TranscriptionPaginationContainer>
        </TranscriptionContainer>
      </Main>
    </Screen>
  );
}
