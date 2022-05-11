import React from 'react';
import styled from 'styled-components';

import {
  CandidateContest,
  Election,
  getPartyAbbrevationByPartyId,
} from '@votingworks/types';
import { Button, Main, MainChild, Screen, Text } from '@votingworks/ui';
import { assert } from '@votingworks/utils';
import { Navigation } from '../components/navigation';
import { TextInput } from '../components/text_input';

const BallotPreviews = styled.div`
  flex: 3;
  padding: 1rem;
`;

const Transcription = styled.div`
  flex: 2;
  position: relative;
  border-left: 1px solid #cccccc;
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
  position: absolute;
  bottom: 0;
  left: 0;
  border-top: 1px solid #cccccc;
  background: #ffffff;
  width: 100%;
  padding: 0.5rem 1rem;
`;

function PreviouslyTranscribedValues({
  saveTranscribedValue,
}: {
  saveTranscribedValue: (transcribedValue: string) => void;
}) {
  const previouslyTranscribedValues = [
    'Mickey Mouse',
    'Mickey M',
    'Micky',
    'Donald',
    'Donald Duck',
    'Roger Rabbit',
    'RR',
    'DD',
    'M. Mouse',
  ];
  return (
    <PreviouslyTranscribedValuesContainer>
      {previouslyTranscribedValues.map((transcribedValue) => (
        <PreviouslyTranscribedValueButtonWrapper key={transcribedValue}>
          <Button onPress={() => saveTranscribedValue(transcribedValue)}>
            {transcribedValue}
          </Button>
        </PreviouslyTranscribedValueButtonWrapper>
      ))}
    </PreviouslyTranscribedValuesContainer>
  );
}

export function WriteInsTranscriptionScreen({
  contest,
  election,
  onClickNext,
  onClickPrevious,
  onClose,
  onListAll,
  saveTranscribedValue,
}: {
  contest: CandidateContest;
  election: Election;
  onClickNext: () => void;
  onClickPrevious: () => void;
  onClose: () => void;
  onListAll: () => void;
  saveTranscribedValue: (transcribedValue: string) => void;
}): JSX.Element {
  assert(contest);
  assert(election);
  return (
    <Screen>
      <Main>
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
        <MainChild maxWidth={false} flexContainer flexDirection="row">
          <BallotPreviews>BALLOT IMAGES GO HERE</BallotPreviews>
          <Transcription>
            {election && contest.partyId && (
              <React.Fragment>
                <Text bold>{contest.section}</Text>
                <h1>
                  {contest.title} (
                  {getPartyAbbrevationByPartyId({
                    partyId: contest.partyId,
                    election,
                  })}
                  )
                </h1>
              </React.Fragment>
            )}
            <Text>
              <label htmlFor="transcription-value">Transcribed Value</label>
            </Text>
            <TextInput id="transcribed-value" name="transcribed-value" />
            <PreviouslyTranscribedValues
              saveTranscribedValue={saveTranscribedValue}
            />
            <TranscriptionPaginationContainer>
              <Button onPress={onClickPrevious}>Previous</Button>
              <Text bold>2 of 242</Text>
              <Button onPress={onClickNext}>Next</Button>
            </TranscriptionPaginationContainer>
          </Transcription>
        </MainChild>
      </Main>
    </Screen>
  );
}
