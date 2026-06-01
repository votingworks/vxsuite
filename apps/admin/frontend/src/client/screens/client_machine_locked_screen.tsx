import { useContext } from 'react';
import styled from 'styled-components';
import {
  ElectionInfoBar,
  InfoBar,
  Main,
  Screen,
  H1,
  H3,
} from '@votingworks/ui';
import { AppContext } from '../../contexts/app_context';
import { getNetworkConnectionStatus } from '../api';
import { UnconfiguredNetworkStatusIndicator } from '../components/unconfigured_network_status_indicator';

const LockedImage = styled.img`
  margin-right: auto;
  margin-bottom: 1.25em;
  margin-left: auto;
  height: 20vw;
`;

function LockScreenFooter(): JSX.Element | null {
  const { electionDefinition, electionPackageHash, machineConfig } =
    useContext(AppContext);
  const networkStatusQuery = getNetworkConnectionStatus.useQuery();
  if (!networkStatusQuery.isSuccess) return null;

  const status = networkStatusQuery.data;
  // When connected to a configured host, surface the election info instead
  // of the network indicator — the connection itself is implied by the
  // election data being present.
  if (status.status === 'online-connected-to-host' && electionDefinition) {
    return (
      <ElectionInfoBar
        mode="admin"
        electionDefinition={electionDefinition}
        electionPackageHash={electionPackageHash}
        codeVersion={machineConfig.codeVersion}
        machineId={machineConfig.machineId}
      />
    );
  }
  return (
    <InfoBar>
      <UnconfiguredNetworkStatusIndicator status={status} />
    </InfoBar>
  );
}

export function ClientMachineLockedScreen(): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
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
      <LockScreenFooter />
    </Screen>
  );
}
