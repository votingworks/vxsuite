import { H1, H3, Main, Screen } from '@votingworks/ui';
import styled from 'styled-components';
import { ElectionInfoBar } from './election_info_bar';
import { getElection, getMachineConfig } from './api';

const LockedImage = styled.img`
  margin-right: auto;
  margin-bottom: 1.25em;
  margin-left: auto;
  height: 20vw;
`;

export function MachineLockedScreen(): JSX.Element | null {
  const getElectionQuery = getElection.useQuery();
  const getMachineConfigQuery = getMachineConfig.useQuery();

  if (!(getElectionQuery.isSuccess && getMachineConfigQuery.isSuccess)) {
    return null;
  }

  const election = getElectionQuery.data.ok();
  const { machineId, codeVersion } = getMachineConfigQuery.data;

  return (
    <Screen>
      <Main centerChild>
        <div>
          <LockedImage src="/locked.svg" alt="Locked Icon" />
          <H1 align="center">VxPollbook Locked</H1>
          <H3 style={{ fontWeight: 'normal' }}>
            Insert election manager or poll worker card to unlock.
          </H3>
        </div>
      </Main>
      <ElectionInfoBar
        election={election}
        machineId={machineId}
        codeVersion={codeVersion}
      />
    </Screen>
  );
}
