import { useContext } from 'react';
import styled from 'styled-components';
import { ElectionInfoBar, Main, Screen, H1, H3 } from '@votingworks/ui';
import { AppContext } from '../../contexts/app_context';

const LockedImage = styled.img`
  margin-right: auto;
  margin-bottom: 1.25em;
  margin-left: auto;
  height: 20vw;
`;

export function ClientMachineLockedScreen(): JSX.Element {
  const { electionDefinition, electionPackageHash, machineConfig } =
    useContext(AppContext);
  return (
    <Screen>
      <Main centerChild>
        <div>
          <LockedImage src="/locked.svg" alt="Locked Icon" />
          <H1 align="center">Adjudication Station Locked</H1>
          <H3 style={{ fontWeight: 'normal' }}>
            {electionDefinition
              ? 'Insert system administrator or election manager card to unlock.'
              : 'Insert system administrator card to unlock.'}
          </H3>
        </div>
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
