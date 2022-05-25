import React from 'react';
import styled from 'styled-components';

import {
  CandidateContest,
  CastVoteRecord,
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
  ballotIdxBeingAdjudicated,
  ballotsBeingAdjudicated,
  onClickNext,
  onClickPrevious,
  onClose,
  onListAll,
  saveTranscribedValue,
}: {
  contest: CandidateContest;
  election: Election;
  ballotIdxBeingAdjudicated: number;
  ballotsBeingAdjudicated: CastVoteRecord[];
  onClickNext?: () => void;
  onClickPrevious?: () => void;
  onClose: () => void;
  onListAll: () => void;
  saveTranscribedValue: (transcribedValue: string) => void;
}): JSX.Element {
  assert(contest);
  assert(election);
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
              </React.Fragment>
            )}
            <Text>
              <label htmlFor="transcription-value">Transcribed Value</label>
            </Text>
            <TextInput id="transcribed-value" name="transcribed-value" />
            <PreviouslyTranscribedValues
              saveTranscribedValue={saveTranscribedValue}
            />
            <p>Here</p>
            <p>are</p>
            <p>a</p>
            <p>bunch</p>
            <p>of</p>
            <p>paragraphs</p>
            <p>to</p>
            <p>make</p>
            <p>the</p>
            <p>container</p>
            <p>container</p>
            <p>container</p>
            <p>container</p>
            <p>container</p>
            <p>overflow.</p>
          </TranscriptionMainContentContainer>
          <TranscriptionPaginationContainer>
            <Button
              disabled={!onClickPrevious}
              onPress={onClickPrevious || (() => null)}
            >
              Previous
            </Button>
            <Text bold>
              {ballotIdxBeingAdjudicated + 1} of{' '}
              {ballotsBeingAdjudicated.length}
            </Text>
            <Button
              disabled={!onClickNext}
              onPress={onClickNext || (() => null)}
            >
              Next
            </Button>
          </TranscriptionPaginationContainer>
        </TranscriptionContainer>
      </Main>
    </Screen>
  );
}
