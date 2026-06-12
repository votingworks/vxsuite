import React, { useState } from 'react';
import styled from 'styled-components';

import { Id } from '@votingworks/types';
import { Button, Modal, Loading, P } from '@votingworks/ui';
import { assertDefined } from '@votingworks/basics';
import {
  Column,
  Container,
  ExpandedSelect,
  Footer,
  Form,
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

const TitleBarButton = styled(Button)`
  width: 16rem;
`;

function PrintTestDeckModal({
  precinctId,
  onClose,
}: {
  precinctId?: Id;
  onClose: () => void;
}): JSX.Element | null {
  const printTestDeckMutation = printTestDeck.useMutation();
  const getTestDeckBallotCountQuery = getTestDeckBallotCount.useQuery({
    precinctId,
  });
  const [isShowingPrintingModal, setIsShowingPrintingModal] = useState(false);

  if (getTestDeckBallotCountQuery.data === undefined) {
    return null;
  }

  const ballotCount = getTestDeckBallotCountQuery.data;

  function handlePrint() {
    setIsShowingPrintingModal(true);
    setTimeout(() => {
      onClose();
    }, DEFAULT_PROGRESS_MODAL_DELAY_SECONDS * 1000);
    printTestDeckMutation.mutate({ precinctId });
  }

  if (isShowingPrintingModal) {
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

  return (
    <Modal
      title="Print Test Deck"
      content={<P>Print {ballotCount} test deck ballots and tally report?</P>}
      onOverlayClick={onClose}
      actions={
        <React.Fragment>
          <Button
            icon="Print"
            variant="primary"
            onPress={handlePrint}
            disabled={ballotCount === 0}
          >
            Print {ballotCount} Ballots
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
  const [printModal, setPrintModal] = useState<'none' | 'all' | 'precinct'>(
    'none'
  );

  const getElectionRecordQuery = getElectionRecord.useQuery();
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();

  if (!getElectionRecordQuery.isSuccess || !getDeviceStatusesQuery.isSuccess) {
    return null;
  }

  const {
    electionDefinition: { election },
  } = assertDefined(getElectionRecordQuery.data);
  const { printer } = getDeviceStatusesQuery.data;

  const selectedPrecinct = selectedPrecinctId
    ? election.precincts.find((p) => p.id === selectedPrecinctId)
    : undefined;

  return (
    <ScreenWrapper authType="election_manager">
      <Container>
        <TitleBar
          title="Test Decks"
          actions={
            <TitleBarButton
              disabled={!printer.connected}
              color="neutral"
              fill="outlined"
              onPress={() => setPrintModal('all')}
            >
              Print All Test Decks
            </TitleBarButton>
          }
        />
        <Form>
          <Column>
            <FormSection>
              <strong>Precinct</strong>
              <ExpandedSelect
                selectedValue={selectedPrecinctId}
                options={election.precincts
                  .filter(
                    (p) =>
                      !searchValue ||
                      p.name.toLowerCase().includes(searchValue.toLowerCase())
                  )
                  .map((p) => ({ value: p.id, label: p.name }))}
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
            onPress={() => setPrintModal('precinct')}
            disabled={!selectedPrecinct || !printer.connected}
          >
            Print Precinct Test Deck
          </PrintButton>
        </Footer>
        {printModal !== 'none' && (
          <PrintTestDeckModal
            precinctId={
              printModal === 'precinct'
                ? assertDefined(selectedPrecinct).id
                : undefined
            }
            onClose={() => setPrintModal('none')}
          />
        )}
      </Container>
    </ScreenWrapper>
  );
}
