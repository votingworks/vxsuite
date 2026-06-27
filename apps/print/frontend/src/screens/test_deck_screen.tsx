import React, { useState } from 'react';
import styled from 'styled-components';

import { Election, Id } from '@votingworks/types';
import { Button, Modal, Loading, P } from '@votingworks/ui';
import { assertDefined } from '@votingworks/basics';
import {
  Column,
  Container,
  Footer,
  Form,
  PrecinctSelect,
  PrintButton,
  ScreenWrapper,
  TitleBar,
} from '../components';
import {
  getDeviceStatuses,
  getElectionRecord,
  getTestDeckBallotCount,
  printTestDeck,
} from '../api';

const DEFAULT_PROGRESS_MODAL_DELAY_SECONDS = 3;

const FormSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: hidden;
  flex: 1;

  > strong {
    padding-left: 0.25rem;
  }
`;

function PrintTestDeckModal({
  election,
  precinctId,
  overallTallyReportOnly,
  onClose,
}: {
  election: Election;
  precinctId?: Id;
  overallTallyReportOnly?: boolean;
  onClose: () => void;
}): JSX.Element | null {
  const printTestDeckMutation = printTestDeck.useMutation();
  const getTestDeckBallotCountQuery = getTestDeckBallotCount.useQuery({
    precinctId,
  });
  const [isShowingPrintMessage, setIsShowingPrintMessage] = useState(false);

  if (!getTestDeckBallotCountQuery.isSuccess) {
    return null;
  }

  const ballotCount = getTestDeckBallotCountQuery.data;

  function handlePrint() {
    setIsShowingPrintMessage(true);
    setTimeout(() => {
      onClose();
    }, DEFAULT_PROGRESS_MODAL_DELAY_SECONDS * 1000);
    printTestDeckMutation.mutate(
      overallTallyReportOnly ? { overallTallyReportOnly: true } : { precinctId }
    );
  }

  if (isShowingPrintMessage) {
    return (
      <Modal
        centerContent
        content={
          <Loading animationDurationS={DEFAULT_PROGRESS_MODAL_DELAY_SECONDS}>
            Printing
          </Loading>
        }
      />
    );
  }

  const [title, content, buttonText] = (() => {
    if (overallTallyReportOnly) {
      return [
        'Print Overall Tally Report',
        'Print the overall tally report?',
        'Print',
      ];
    }
    if (precinctId) {
      const precinctName = assertDefined(
        election.precincts.find((p) => p.id === precinctId)
      ).name;
      return [
        'Print Precinct Test Deck',
        `Print ${ballotCount} test deck ballots and the precinct tally report for ${precinctName}?`,
        `Print ${ballotCount} Ballots`,
      ];
    }
    return [
      'Print All Test Decks',
      `Print ${ballotCount} test deck ballots, the overall tally report, and all precinct tally reports?`,
      `Print ${ballotCount} Ballots`,
    ];
  })();

  return (
    <Modal
      title={title}
      content={<P>{content}</P>}
      onOverlayClick={onClose}
      actions={
        <React.Fragment>
          <Button
            icon="Print"
            variant="primary"
            onPress={handlePrint}
            disabled={ballotCount === 0}
          >
            {buttonText}
          </Button>
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
    />
  );
}

export function TestDeckScreen(): JSX.Element | null {
  const [searchValue, setSearchValue] = useState<string>('');
  const [selectedPrecinctId, setSelectedPrecinctId] = useState<Id>('');
  const [printTestDeckTarget, setPrintTestDeckTarget] = useState<{
    precinctId?: Id;
    overallTallyReportOnly?: boolean;
  }>();

  const getElectionRecordQuery = getElectionRecord.useQuery();
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();

  if (!getElectionRecordQuery.isSuccess || !getDeviceStatusesQuery.isSuccess) {
    return null;
  }

  const {
    electionDefinition: { election },
  } = assertDefined(getElectionRecordQuery.data);
  const { printer } = getDeviceStatusesQuery.data;

  return (
    <ScreenWrapper authType="election_manager">
      <Container>
        <TitleBar
          title="Test Decks"
          actions={
            <React.Fragment>
              <Button
                disabled={!printer.connected}
                color="neutral"
                fill="outlined"
                onPress={() =>
                  setPrintTestDeckTarget({ overallTallyReportOnly: true })
                }
              >
                Print Overall Tally Report
              </Button>
              <Button
                disabled={!printer.connected}
                color="neutral"
                fill="outlined"
                onPress={() => {
                  setPrintTestDeckTarget({ precinctId: undefined });
                }}
              >
                Print All Test Decks
              </Button>
            </React.Fragment>
          }
        />
        <Form>
          <Column>
            <FormSection>
              <PrecinctSelect
                searchValue={searchValue}
                selectedPrecinctId={selectedPrecinctId}
                precincts={election.precincts}
                onSearch={setSearchValue}
                onSelect={setSelectedPrecinctId}
              />
            </FormSection>
          </Column>
        </Form>
        <Footer>
          <PrintButton
            icon="Print"
            color="primary"
            fill="filled"
            onPress={() =>
              setPrintTestDeckTarget({ precinctId: selectedPrecinctId })
            }
            disabled={!selectedPrecinctId || !printer.connected}
          >
            Print Precinct Test Deck
          </PrintButton>
        </Footer>
        {printTestDeckTarget && (
          <PrintTestDeckModal
            election={election}
            precinctId={printTestDeckTarget.precinctId}
            overallTallyReportOnly={printTestDeckTarget.overallTallyReportOnly}
            onClose={() => setPrintTestDeckTarget(undefined)}
          />
        )}
      </Container>
    </ScreenWrapper>
  );
}
