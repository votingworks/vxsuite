import { CandidateContest, ContestOptionId, Id } from '@votingworks/types';
import { Button, Loading, Main, Prose, Screen, Text } from '@votingworks/ui';
import { format } from '@votingworks/utils';
import pluralize from 'pluralize';
import React from 'react';
import styled from 'styled-components';
import { Navigation } from '../components/navigation';
import { WriteInAdjudicationTable } from '../components/write_in_adjudication_table';
import { useWriteInAdjudicationTableQuery } from '../hooks/use_write_in_adjudication_table_query';

const ContentWrapper = styled.div`
  display: flex;
`;

const ContestAdjudication = styled.div`
  margin-bottom: 1rem;
  border: 2px solid #455a64;
  border-radius: 0.25rem;
  background: #ffffff;
`;

const Header = styled.div`
  padding: 1rem;
  p + h2 {
    margin-top: -0.6em;
  }
`;

export interface Props {
  readonly contest: CandidateContest;
  readonly onClose: () => void;
  readonly adjudicateTranscription: (
    transcribedValue: string,
    adjudicatedValue: string,
    adjudicatedOptionId?: ContestOptionId
  ) => void;
  readonly updateAdjudication: (
    id: Id,
    adjudicatedValue: string,
    adjudicatedOptionId?: ContestOptionId
  ) => void;
}

export function WriteInsAdjudicationScreen({
  contest,
  onClose,
  adjudicateTranscription,
  updateAdjudication,
}: Props): JSX.Element {
  const writeInAdjudicationTableQuery = useWriteInAdjudicationTableQuery({
    contestId: contest.id,
  });
  const { isLoading } = writeInAdjudicationTableQuery;

  const contestWriteInCount =
    writeInAdjudicationTableQuery.data?.writeInCount ?? 0;
  const transcriptionsToAdjudicateCount =
    writeInAdjudicationTableQuery.data?.transcribed.rows.length ?? 0;
  const adjudicationQueuePhrase = writeInAdjudicationTableQuery.data
    ? `${format.count(transcriptionsToAdjudicateCount)} ${pluralize(
        'transcriptions',
        transcriptionsToAdjudicateCount
      )} to adjudicate`
    : '';

  return (
    <Screen grey>
      <Navigation
        screenTitle="Write-In Adjudication"
        secondaryNav={
          !isLoading && (
            <React.Fragment>
              {transcriptionsToAdjudicateCount > 0 && (
                <Text as="span">{adjudicationQueuePhrase}.</Text>
              )}
              <Button
                small
                primary={transcriptionsToAdjudicateCount === 0}
                onPress={onClose}
              >
                Back to All Write-Ins
              </Button>
            </React.Fragment>
          )
        }
      />
      <Main padded>
        <ContentWrapper>
          <Prose maxWidth={false}>
            <ContestAdjudication>
              <Header>
                <Prose>
                  <p>{contest.section}</p>
                  <h2>{contest.title}</h2>
                  <p>Total write-ins: {format.count(contestWriteInCount)}</p>
                </Prose>
              </Header>
              {writeInAdjudicationTableQuery.data ? (
                <WriteInAdjudicationTable
                  adjudicationTable={writeInAdjudicationTableQuery.data}
                  adjudicationQueuePhrase={adjudicationQueuePhrase}
                  adjudicateTranscription={adjudicateTranscription}
                  updateAdjudication={updateAdjudication}
                />
              ) : (
                <Loading />
              )}
            </ContestAdjudication>
          </Prose>
        </ContentWrapper>
      </Main>
    </Screen>
  );
}
