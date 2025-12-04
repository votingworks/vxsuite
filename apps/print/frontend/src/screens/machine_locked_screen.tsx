import styled from 'styled-components';
import { ElectionInfoBar, H1, H3, Main, Screen } from '@votingworks/ui';
import { getElectionRecord, getMachineConfig } from '../api';
import { Column } from '../layout';

const LockedImage = styled.img`
  margin-right: auto;
  margin-bottom: 1.25em;
  margin-left: auto;
  height: 20vw;
`;

export function MachineLockedScreen(): JSX.Element | null {
  const getElectionRecordQuery = getElectionRecord.useQuery();
  const getMachineConfigQuery = getMachineConfig.useQuery();

  if (!getElectionRecordQuery.isSuccess || !getMachineConfigQuery.isSuccess) {
    return null;
  }

  const electionDefinition = getElectionRecordQuery.data?.electionDefinition;
  const electionPackageHash = getElectionRecordQuery.data?.electionPackageHash;
  const machineConfig = getMachineConfigQuery.data;
  return (
    <Screen>
      <Main centerChild>
        <Column style={{ alignItems: 'center' }}>
          <LockedImage src="/locked.svg" alt="Locked Icon" />
          <H1 style={{ marginTop: '0' }}>VxPrint Locked</H1>
          <H3 style={{ fontWeight: 'normal' }}>
            {electionDefinition
              ? 'Insert card to unlock.'
              : 'Insert an election manager card to configure VxPrint.'}
          </H3>
        </Column>
      </Main>
      <ElectionInfoBar
        mode="admin"
        electionDefinition={electionDefinition}
        electionPackageHash={electionPackageHash}
        codeVersion={machineConfig.codeVersion}
        machineId={machineConfig.machineId}
      />
    </Screen>
  );
}
