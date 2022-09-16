import { Admin } from '@votingworks/api';
import { CandidateContest, ContestOptionId, Id } from '@votingworks/types';
import { Button, Main, Prose, Screen, Text } from '@votingworks/ui';
import { collections, format, groupBy } from '@votingworks/utils';
import pluralize from 'pluralize';
import React from 'react';
import styled from 'styled-components';
import { Navigation } from '../components/navigation';
import {
  AdjudicationGroup,
  AdjudicationOption,
  PendingWriteInAdjudication,
  WriteInAdjudicationTable,
} from '../components/write_in_adjudication_table';

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
  readonly writeInSummaryEntries: readonly Admin.WriteInSummaryEntry[];
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
  writeInSummaryEntries,
  onClose,
  adjudicateTranscription,
  updateAdjudication,
}: Props): JSX.Element {
  const contestWriteInCount = writeInSummaryEntries.reduce(
    (acc, entry) => acc + entry.writeInCount,
    0
  );

  const adjudicatedGroups: AdjudicationGroup[] = [];
  const pendingAdjudications: PendingWriteInAdjudication[] = [];

  for (const [adjudicatedValue, entries] of groupBy(
    writeInSummaryEntries,
    (entry) => entry.writeInAdjudication?.adjudicatedValue
  )) {
    if (adjudicatedValue) {
      adjudicatedGroups.push({
        adjudicatedValue,
        writeInCount: collections.reduce(
          entries,
          (acc, entry) => acc + entry.writeInCount,
          0
        ),
        writeInAdjudications: Array.from(entries, (entry) => ({
          id: entry.writeInAdjudication?.id as Id,
          adjudicatedValue: entry.writeInAdjudication
            ?.adjudicatedValue as string,
          transcribedValue: entry.writeInAdjudication
            ?.transcribedValue as string,
          writeInCount: entry.writeInCount,
        })),
      });
    } else {
      for (const entry of entries) {
        if (entry.transcribedValue) {
          pendingAdjudications.push({
            transcribedValue: entry.transcribedValue,
            writeInCount: entry.writeInCount,
          });
        }
      }
    }
  }

  const adjudicationQueuePhrase = `${format.count(
    pendingAdjudications.length
  )} ${pluralize('transcriptions', pendingAdjudications.length)} to adjudicate`;

  const adjudicationValues = [
    ...pendingAdjudications.map(
      (pendingAdjudication): AdjudicationOption => ({
        adjudicatedValue: pendingAdjudication.transcribedValue,
        hasAdjudication: false,
      })
    ),
    // TODO: we want to include some of these, I think
    // ...adjudicatedGroups.map(
    //   (adjudicatedGroup): AdjudicationOption => ({
    //     adjudicatedValue: adjudicatedGroup.adjudicatedValue,
    //     hasAdjudication: true,
    //   })
    // ),
    ...contest.candidates.map(
      (c): AdjudicationOption => ({
        adjudicatedValue: `${c.name} (official candidate)`,
        adjudicatedOptionId: c.id,
        hasAdjudication: false,
      })
    ),
  ].sort((a, b) => a.adjudicatedValue.localeCompare(b.adjudicatedValue));

  return (
    <Screen grey>
      <Navigation
        screenTitle="Write-In Adjudication"
        secondaryNav={
          <React.Fragment>
            {pendingAdjudications.length > 0 && (
              <Text as="span">{adjudicationQueuePhrase}.</Text>
            )}
            <Button
              small
              primary={pendingAdjudications.length === 0}
              onPress={onClose}
            >
              Back to All Write-Ins
            </Button>
          </React.Fragment>
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
              <WriteInAdjudicationTable
                adjudicatedGroups={adjudicatedGroups}
                pendingAdjudications={pendingAdjudications}
                adjudicationQueuePhrase={adjudicationQueuePhrase}
                adjudicationValues={adjudicationValues}
                adjudicateTranscription={adjudicateTranscription}
                updateAdjudication={updateAdjudication}
              />
            </ContestAdjudication>
          </Prose>
        </ContentWrapper>
      </Main>
    </Screen>
  );
}
