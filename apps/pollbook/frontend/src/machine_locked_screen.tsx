import { H1, H3, Main, Screen } from '@votingworks/ui';
import styled from 'styled-components';
import React from 'react';
import { ElectionInfoBar } from './election_info_bar';
import { getElection, getMachineConfig } from './api';
import { DeviceStatusBar } from './nav_screen';

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
      <DeviceStatusBar showLogOutButton={false} />
      <Main centerChild>
        <div>
          <LockedImage src="/locked.svg" alt="Locked Icon" />
          <H1 align="center">VxPollbook Locked</H1>
          <H3 style={{ fontWeight: 'normal' }}>
            {getElectionQuery.data.isOk() ? (
              <React.Fragment>Insert card to unlock.</React.Fragment>
            ) : (
              <React.Fragment>
                Insert system administrator or election manager card to unlock.
              </React.Fragment>
            )}
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
