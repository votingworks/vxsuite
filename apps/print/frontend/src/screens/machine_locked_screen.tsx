import styled from 'styled-components';
import {
  ElectionInfoBar,
  Font,
  H1,
  H3,
  InsertCardImage,
  Main,
  Screen,
} from '@votingworks/ui';
import {
  BooleanEnvironmentVariableName as Feature,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import {
  getElectionRecord,
  getMachineConfig,
  getPollingPlaceId,
  getPrecinctSelection,
} from '../api';

const LockedImage = styled.img`
  margin-right: auto;
  margin-bottom: 1.25em;
  margin-left: auto;
  height: 20vw;
`;

export function MachineLockedScreen(): JSX.Element | null {
  const usePollingPlaces = isFeatureFlagEnabled(Feature.ENABLE_POLLING_PLACES);
  const getElectionRecordQuery = getElectionRecord.useQuery();
  const getMachineConfigQuery = getMachineConfig.useQuery();
  const getPrecinctSelectionQuery = getPrecinctSelection.useQuery();
  const getPollingPlaceIdQuery = getPollingPlaceId.useQuery();

  if (
    !getElectionRecordQuery.isSuccess ||
    !getMachineConfigQuery.isSuccess ||
    !getPrecinctSelectionQuery.isSuccess ||
    !getPollingPlaceIdQuery.isSuccess
  ) {
    return null;
  }

  const electionDefinition = getElectionRecordQuery.data?.electionDefinition;
  const electionPackageHash = getElectionRecordQuery.data?.electionPackageHash;
  const machineConfig = getMachineConfigQuery.data;
  const pollingPlaceId = getPollingPlaceIdQuery.data;
  const requiresElectionConfiguration = !electionDefinition;
  const requiresLocationSelection = usePollingPlaces
    ? !pollingPlaceId
    : !getPrecinctSelectionQuery.data;
  const isConfigured =
    !requiresElectionConfiguration && !requiresLocationSelection;

  const locationType = usePollingPlaces ? 'polling place' : 'precinct';

  return (
    <Screen>
      <Main centerChild>
        {isConfigured ? (
          <Font align="center">
            <LockedImage src="/locked.svg" alt="Locked Icon" />
            <H1 style={{ marginTop: '0' }}>VxPrint Locked</H1>
            <H3 style={{ fontWeight: 'normal' }}>Insert card to unlock.</H3>
          </Font>
        ) : (
          <Font align="center">
            <InsertCardImage cardInsertionDirection="right" />
            <H1 style={{ maxWidth: '27rem', marginTop: '0' }}>
              {requiresLocationSelection
                ? `Insert an election manager card to select a ${locationType}.`
                : 'Insert an election manager card to configure VxPrint.'}
            </H1>
          </Font>
        )}
      </Main>
      <ElectionInfoBar
        mode="admin"
        electionDefinition={electionDefinition}
        electionPackageHash={electionPackageHash}
        pollingPlaceId={pollingPlaceId ?? undefined}
        codeVersion={machineConfig.codeVersion}
        machineId={machineConfig.machineId}
      />
    </Screen>
  );
}
