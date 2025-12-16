import {
  Card,
  H2,
  MainContent,
  P,
  Seal,
  UnconfigureMachineButton,
  SearchSelect,
} from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { Precinct, PrecinctSelection } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import styled from 'styled-components';
import {
  getElectionRecord,
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

  /* Ensure SearchSelect dropdown is not cut off */
  overflow: visible;
`;

const ALL_PRECINCTS_KEY = '\0all-precincts';

export function ElectionScreen(): JSX.Element | null {
  const getElectionRecordQuery = getElectionRecord.useQuery();
  const selectedPrecinctQuery = getPrecinctSelection.useQuery();
  const setPrecinctSelectionMutation = setPrecinctSelection.useMutation();
  const unconfigureMutation = unconfigureMachine.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();

  if (!getElectionRecordQuery.isSuccess || !selectedPrecinctQuery.isSuccess) {
    return null;
  }

  const {
    electionDefinition: { election },
  } = assertDefined(getElectionRecordQuery.data);

  // Get precinct options for SearchSelect
  const precinctOptions = election.precincts.map((precinct: Precinct) => ({
    value: precinct.id,
    label: precinct.name,
  }));
  if (election.precincts.length > 1) {
    precinctOptions.unshift({
      value: ALL_PRECINCTS_KEY,
      label: 'All Precincts',
    });
  }

  // Find currently configured precinct (if any)
  const selectedPrecinct = selectedPrecinctQuery.data;
  const configuredPrecinctId =
    selectedPrecinct?.kind === 'AllPrecincts'
      ? ALL_PRECINCTS_KEY
      : selectedPrecinct?.precinctId;

  async function unconfigure(): Promise<void> {
    try {
      await ejectUsbDriveMutation.mutateAsync();
      await unconfigureMutation.mutateAsync();
    } catch {
      // Handled by default query client error handling
    }
  }

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
        <Row style={{ alignItems: 'center', gap: '1rem' }}>
          {precinctOptions.length > 1 && (
            <SearchSelect
              aria-label="Select Precinct"
              options={precinctOptions}
              value={configuredPrecinctId}
              onChange={async (precinctId) => {
                if (precinctId) {
                  const precinctSelection: PrecinctSelection =
                    precinctId === ALL_PRECINCTS_KEY
                      ? { kind: 'AllPrecincts' }
                      : { kind: 'SinglePrecinct', precinctId };
                  try {
                    await setPrecinctSelectionMutation.mutateAsync({
                      precinctSelection,
                    });
                  } catch {
                    // Handled by default query client error handling
                  }
                }
              }}
              placeholder="Select Precinct…"
              style={{ width: '16rem' }}
              isSearchable
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
