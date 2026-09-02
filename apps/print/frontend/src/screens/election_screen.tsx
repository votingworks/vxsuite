import {
  Card,
  H2,
  MainContent,
  P,
  Seal,
  UnconfigureMachineButton,
  PollingPlacePicker,
} from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { assertDefined } from '@votingworks/basics';
import styled from 'styled-components';
import {
  getElectionRecord,
  getPollingPlaceId,
  setPollingPlaceId,
  unconfigureMachine,
  ejectUsbDrive,
} from '../api.js';
import { TitleBar } from '../components/title_bar.js';
import { ScreenWrapper } from '../components/screen_wrapper.js';

const Row = styled.div`
  display: flex;
  flex-direction: row;
`;

const Content = styled(MainContent)`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

export function ElectionScreen(): JSX.Element | null {
  const getElectionRecordQuery = getElectionRecord.useQuery();
  const pollingPlaceIdQuery = getPollingPlaceId.useQuery();
  const selectPollingPlace = setPollingPlaceId.useMutation().mutateAsync;
  const unconfigureMutation = unconfigureMachine.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();

  // @coverage-defer
  if (!getElectionRecordQuery.isSuccess || !pollingPlaceIdQuery.isSuccess) {
    return null;
  }

  const {
    electionDefinition: { election },
  } = assertDefined(getElectionRecordQuery.data);

  // @coverage-defer
  async function unconfigure(): Promise<void> {
    try {
      await ejectUsbDriveMutation.mutateAsync();
      await unconfigureMutation.mutateAsync();
    } catch {
      // Handled by default query client error handling
    }
  }

  // @coverage-defer
  const pollingPlaces = election.pollingPlaces || [];

  return (
    <ScreenWrapper authType="election_manager">
      <TitleBar title="Election" />
      <Content>
        <Card color="neutral">
          <Row style={{ gap: '1rem', alignItems: 'center' }}>
            <Seal seal={election.seal} maxWidth="7rem" />
            <div>
              <H2>{election.title}</H2>
              <P>
                {election.jurisdiction.name}, {election.state}
                <br />
                {format.localeLongDate(
                  election.date.toMidnightDatetimeWithSystemTimezone()
                )}
              </P>
            </div>
          </Row>
        </Card>
        <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          {pollingPlaces.length > 1 && (
            <PollingPlacePicker
              mode="default"
              places={pollingPlaces}
              searchable
              selectedId={pollingPlaceIdQuery.data || undefined}
              // @coverage-defer
              selectPlace={(id) => selectPollingPlace({ id })}
              style={{ width: '16rem' }}
            />
          )}
          <UnconfigureMachineButton
            unconfigureMachine={unconfigure}
            isMachineConfigured
          />
        </Row>
      </Content>
    </ScreenWrapper>
  );
}
