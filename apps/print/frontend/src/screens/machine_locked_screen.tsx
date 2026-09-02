// @coverage-defer-file
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
import { getElectionRecord, getMachineConfig, getPollingPlaceId } from '../api.js';

const LockedImage = styled.img`
  margin-right: auto;
  margin-bottom: 1.25em;
  margin-left: auto;
  height: 20vw;
`;

export function MachineLockedScreen(): JSX.Element | null {
  const getElectionRecordQuery = getElectionRecord.useQuery();
  const getMachineConfigQuery = getMachineConfig.useQuery();
  const getPollingPlaceIdQuery = getPollingPlaceId.useQuery();

  if (
    !getElectionRecordQuery.isSuccess ||
    !getMachineConfigQuery.isSuccess ||
    !getPollingPlaceIdQuery.isSuccess
  ) {
    return null;
  }

  const electionDefinition = getElectionRecordQuery.data?.electionDefinition;
  const electionPackageHash = getElectionRecordQuery.data?.electionPackageHash;
  const machineConfig = getMachineConfigQuery.data;
  const pollingPlaceId = getPollingPlaceIdQuery.data;
  const requiresElectionConfiguration = !electionDefinition;
  const requiresLocationSelection = !pollingPlaceId;
  const isConfigured =
    !requiresElectionConfiguration && !requiresLocationSelection;

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
              {requiresElectionConfiguration
                ? 'Insert an election manager card to configure VxPrint.'
                : `Insert an election manager card to select a polling place.`}
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
