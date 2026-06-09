import React, { useState } from 'react';
import styled from 'styled-components';

import {
  BooleanEnvironmentVariableName as Feature,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import {
  Id,
  pollingPlaceFromElection,
  pollingPlacePrecinctIds,
} from '@votingworks/types';
import { Button, Modal, Loading, P } from '@votingworks/ui';
import { assertDefined, find } from '@votingworks/basics';
import { ExpandedSelect } from '../components/expanded_select';
import { TitleBar } from '../components/title_bar';
import {
  getDeviceStatuses,
  getElectionRecord,
  getPollingPlaceId,
  getPrecinctSelection,
  getTestDeckBallotCount,
  printTestDeck,
} from '../api';
import { ScreenWrapper } from '../components/screen_wrapper';

const DEFAULT_PROGRESS_MODAL_DELAY_SECONDS = 3;

const Container = styled.div`
  /* Adjusted for Toolbar height */
  height: calc(100vh - 2.2rem);
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: hidden;
  padding-bottom: 0;
`;

const Form = styled.div`
  /* Adjusted for Toolbar, TitleBar, and Footer heights */
  height: calc(100% - 4rem - 2rem - 4rem);
  flex: 1;
  overflow-y: hidden;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  padding: 1rem 0.75rem 1rem 1rem;
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: hidden;
`;

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

const Footer = styled.div`
  position: sticky;
  bottom: 0;
  height: 4rem;
  padding: 0.5rem 1rem;
  flex-shrink: 0;
  background-color: ${(p) => p.theme.colors.container};
  border-top: ${(p) => p.theme.sizes.bordersRem.medium}rem solid
    ${(p) => p.theme.colors.outline};
  display: flex;
  align-items: center;
  justify-content: end;
  gap: 1rem;
`;

const TitleBarButton = styled(Button)`
  width: 16rem;
`;

const PrintButton = styled(Button)`
  width: 16rem;
  height: 3rem;
  font-size: 1.1rem;
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

export function TestDeckScreen({
  isElectionManagerAuth,
}: {
  isElectionManagerAuth?: boolean;
}): JSX.Element | null {
  const [searchValue, setSearchValue] = useState<string>('');
  const [selectedPrecinctId, setSelectedPrecinctId] = useState<Id>('');
  const [printModal, setPrintModal] = useState<'none' | 'all' | 'precinct'>(
    'none'
  );

  const getElectionRecordQuery = getElectionRecord.useQuery();
  const getConfiguredPrecinctQuery = getPrecinctSelection.useQuery();
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();
  const configuredPrecinct = getConfiguredPrecinctQuery.data;
  const pollingPlaceId = getPollingPlaceId.useQuery().data;

  // The precinct selection defaults to the first precinct of the machine's
  // configured polling place (or configured single precinct), but the screen
  // always offers all precincts in the election.
  const defaultPrecincts = React.useMemo(() => {
    if (!getElectionRecordQuery.data) return [];

    const { election } = getElectionRecordQuery.data.electionDefinition;

    if (!isFeatureFlagEnabled(Feature.ENABLE_POLLING_PLACES)) {
      if (configuredPrecinct?.kind === 'SinglePrecinct') {
        const { precinctId } = configuredPrecinct;
        return [find(election.precincts, (p) => p.id === precinctId)];
      }

      return election.precincts;
    }

    if (!pollingPlaceId) return election.precincts;

    const place = pollingPlaceFromElection(election, pollingPlaceId);
    const precinctIds = pollingPlacePrecinctIds(place);

    return election.precincts.filter((p) => precinctIds.has(p.id));
  }, [configuredPrecinct, getElectionRecordQuery.data, pollingPlaceId]);

  if (!selectedPrecinctId && defaultPrecincts.length > 0) {
    setSelectedPrecinctId(defaultPrecincts[0].id);
  }

  if (
    !getElectionRecordQuery.isSuccess ||
    !getConfiguredPrecinctQuery.isSuccess ||
    !getDeviceStatusesQuery.isSuccess
  ) {
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
    <ScreenWrapper
      authType={isElectionManagerAuth ? 'election_manager' : 'poll_worker'}
    >
      <Container>
        <TitleBar
          title="Print Test Deck"
          actions={
            isElectionManagerAuth ? (
              <TitleBarButton
                disabled={!printer.connected}
                color="neutral"
                fill="outlined"
                onPress={() => setPrintModal('all')}
              >
                Print test deck for all precincts
              </TitleBarButton>
            ) : undefined
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
            Print test deck for precinct
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
