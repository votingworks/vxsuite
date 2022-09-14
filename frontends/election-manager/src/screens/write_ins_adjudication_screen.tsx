import React from 'react';
import styled from 'styled-components';

import {
  Button,
  Main,
  Prose,
  Screen,
  Select,
  Table as TableUI,
  TD as TableDataUI,
  TH,
  Text,
} from '@votingworks/ui';
import {
  CandidateContest,
  EventTargetFunction,
  PartyId,
} from '@votingworks/types';

import pluralize from 'pluralize';
import { Navigation } from '../components/navigation';

function add(a: number, b: number) {
  return a + b;
}

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

const InvertedTableRow = styled.tr<{ primary?: boolean }>`
  th,
  td {
    border-width: 1px 0;
    border-color: ${({ primary }) => (primary ? 'rgb(57 132 59)' : '#ffffff')};
    background: ${({ primary }) => (primary ? 'rgb(71, 167, 75)' : '#455a64')};
    color: #ffffff;
  }
`;

const AdjudicatedRow = styled.tr`
  td {
    background: #dce1e5;
  }
`;

const Table = styled(TableUI)`
  tr:last-child {
    td,
    th {
      border-bottom: none;
    }
  }
`;

const TD = styled(TableDataUI)`
  width: 1%;
  .transcription-row &:nth-child(2) {
    width: 100%;
  }
`;

interface AdjudicationTranscription {
  value: string;
  count: number;
}
interface ContestAdjudicationRecord {
  value: string;
  transcriptions: AdjudicationTranscription[];
}
interface AdjudicationValue {
  name: string;
  candidateId?: string;
  partyIds?: PartyId[];
  hasAdjudication: boolean;
}

export function WriteInsAdjudicationScreen({
  contest,
  contestAdjudications,
  onClose,
  adjudicateTranscription,
  unadjudicateTranscription,
}: {
  contest: CandidateContest;
  contestAdjudications: ContestAdjudicationRecord[];
  onClose: () => void;
  adjudicateTranscription: (
    transcribedValue: string
  ) => (event: React.ChangeEvent<HTMLSelectElement>) => void;
  unadjudicateTranscription: (transcribedValue: string) => EventTargetFunction;
}): JSX.Element {
  const adjudicationQueue =
    contestAdjudications.find((a) => a.value === '')?.transcriptions.length ||
    0;

  const adjudicationQueuePhrase = `${pluralize(
    'transcriptions',
    adjudicationQueue,
    true
  )} to adjudicate`;

  const contestWriteInCount = contestAdjudications
    .map((a) =>
      a.transcriptions
        .map((t) => t.count)
        .flat()
        .reduce(add, 0)
    )
    .reduce(add, 0);

  const adjudicationValues: AdjudicationValue[] = [
    ...contestAdjudications
      .map((a) =>
        a.transcriptions.map((t) => ({
          name: t.value,
          hasAdjudication: a.value !== t.value && a.value !== '',
        }))
      )
      .flat(),
    ...contest.candidates.map((c) => ({
      name: `${c.name} (official candidate)`,
      candidateId: c.id,
      partyIds: c.partyIds,
      hasAdjudication: false,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const hasAdjudicatedTranscriptions = contestAdjudications[0].value !== '';

  return (
    <Screen grey>
      <Navigation
        screenTitle="Write-In Adjudication"
        secondaryNav={
          <React.Fragment>
            {!!adjudicationQueue && (
              <Text as="span">{adjudicationQueuePhrase}.</Text>
            )}
            <Button small primary={!adjudicationQueue} onPress={onClose}>
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
                  <p>Total write-ins: {contestWriteInCount}</p>
                </Prose>
              </Header>
              <Table>
                <thead>
                  {hasAdjudicatedTranscriptions && (
                    <InvertedTableRow>
                      <TH>Adjudicated Transcriptions</TH>
                      <TH>Count</TH>
                      <TH>Action</TH>
                    </InvertedTableRow>
                  )}
                </thead>
                <tbody>
                  {contestAdjudications.map((adjudication) => {
                    const adjudicationCount =
                      adjudication.transcriptions.reduce(
                        (a, t) => a + t.count,
                        0
                      );
                    return (
                      <React.Fragment key={adjudication.value}>
                        {adjudication.value ? (
                          <AdjudicatedRow>
                            <TD nowrap>
                              <Prose>
                                <h3>{adjudication.value}</h3>
                              </Prose>
                            </TD>
                            <TD textAlign="center">
                              <Prose>
                                <h3>{adjudicationCount}</h3>
                              </Prose>
                            </TD>
                            <TD> </TD>
                          </AdjudicatedRow>
                        ) : (
                          adjudicationCount > 0 && (
                            <InvertedTableRow primary>
                              <TH>
                                <Text as="span" normal>
                                  {adjudicationQueuePhrase}…
                                </Text>
                              </TH>
                              <TD as="th" nowrap>
                                {!hasAdjudicatedTranscriptions && 'Count'}
                              </TD>
                              <TD as="th" nowrap>
                                {!hasAdjudicatedTranscriptions && 'Action'}
                              </TD>
                            </InvertedTableRow>
                          )
                        )}
                        {adjudication.transcriptions.map((transcription) => (
                          <tr
                            key={transcription.value}
                            className="transcription-row"
                          >
                            <TD nowrap>{transcription.value}</TD>
                            <TD textAlign="center">{transcription.count}</TD>
                            <TD nowrap>
                              {adjudication.value === '' ? (
                                <Select
                                  value={adjudication.value}
                                  small={adjudication.value !== ''}
                                  onChange={adjudicateTranscription(
                                    transcription.value
                                  )}
                                >
                                  <option disabled value="">
                                    Select adjudicated candidate name…
                                  </option>
                                  {adjudicationValues.map((v) => (
                                    <option
                                      key={v.name}
                                      value={v.name}
                                      disabled={v.hasAdjudication}
                                    >
                                      {v.name}
                                    </option>
                                  ))}
                                </Select>
                              ) : (
                                <Button
                                  small
                                  onPress={unadjudicateTranscription(
                                    transcription.value
                                  )}
                                >
                                  Change
                                </Button>
                              )}
                            </TD>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </Table>
            </ContestAdjudication>
          </Prose>
        </ContentWrapper>
      </Main>
    </Screen>
  );
}
