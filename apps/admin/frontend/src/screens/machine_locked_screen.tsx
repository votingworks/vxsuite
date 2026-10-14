import { ElectionInfoBar, Main, Screen, H1, H3 } from '@votingworks/ui';
import styled from 'styled-components';
import type { ElectionDefinition } from '@votingworks/types';
import type { MachineConfig } from '@votingworks/admin-backend';

const LockedImage = styled.img`
  margin-right: auto;
  margin-bottom: 1.25em;
  margin-left: auto;
  height: 20vw;
`;

export function MachineLockedScreen({
  electionDefinition,
  electionPackageHash,
  machineConfig,
}: {
  electionDefinition?: ElectionDefinition;
  electionPackageHash?: string;
  machineConfig: MachineConfig;
}): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <div>
          <LockedImage src="/locked.svg" alt="Locked Icon" />
          <H1 align="center">VxAdmin Locked</H1>
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
