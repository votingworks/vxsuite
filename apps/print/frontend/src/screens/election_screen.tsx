import {
  Card,
  H2,
  MainContent,
  P,
  Seal,
  UnconfigureMachineButton,
  ChangePrecinctButton,
  PollingPlacePicker,
} from '@votingworks/ui';
import {
  BooleanEnvironmentVariableName,
  format,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { assertDefined } from '@votingworks/basics';
import styled from 'styled-components';
import {
  getElectionRecord,
  getPollingPlaceId,
  setPollingPlaceId,
  setPrecinctSelection,
  getPrecinctSelection,
  unconfigureMachine,
  ejectUsbDrive,
} from '../api';
import { TitleBar } from '../components/title_bar';
import { ScreenWrapper } from '../components/screen_wrapper';

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
  const usePollingPlaces = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.ENABLE_POLLING_PLACES
  );
  const getElectionRecordQuery = getElectionRecord.useQuery();
  const pollingPlaceIdQuery = getPollingPlaceId.useQuery();
  const selectedPrecinctQuery = getPrecinctSelection.useQuery();
  const selectPrecinct = setPrecinctSelection.useMutation().mutateAsync;
  const selectPollingPlace = setPollingPlaceId.useMutation().mutateAsync;
  const unconfigureMutation = unconfigureMachine.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();

  if (
    !getElectionRecordQuery.isSuccess ||
    !selectedPrecinctQuery.isSuccess ||
    !pollingPlaceIdQuery.isSuccess
  ) {
    return null;
  }

  const {
    electionDefinition: { election },
  } = assertDefined(getElectionRecordQuery.data);

  async function unconfigure(): Promise<void> {
    try {
      await ejectUsbDriveMutation.mutateAsync();
      await unconfigureMutation.mutateAsync();
    } catch {
      // Handled by default query client error handling
    }
  }

  const pollingPlaces = election.pollingPlaces || [];
  const locationPicker = usePollingPlaces
    ? pollingPlaces.length > 1 && (
        <PollingPlacePicker
          mode="default"
          places={pollingPlaces}
          searchable
          selectedId={pollingPlaceIdQuery.data || undefined}
          selectPlace={(id) => selectPollingPlace({ id })}
          style={{ width: '16rem' }}
        />
      )
    : election.precincts.length > 1 && (
        <ChangePrecinctButton
          appPrecinctSelection={selectedPrecinctQuery.data || undefined}
          election={election}
          mode="default"
          style={{ width: '16rem' }}
          searchable
          updatePrecinctSelection={(precinctSelection) =>
            selectPrecinct({ precinctSelection })
          }
          useMenuPortal
        />
      );

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
                {election.county.name}, {election.state}
                <br />
                {format.localeLongDate(
                  election.date.toMidnightDatetimeWithSystemTimezone()
                )}
              </P>
            </div>
          </Row>
        </Card>
        <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          {locationPicker}
          <UnconfigureMachineButton
            unconfigureMachine={unconfigure}
            isMachineConfigured
          />
        </Row>
      </Content>
    </ScreenWrapper>
  );
}
