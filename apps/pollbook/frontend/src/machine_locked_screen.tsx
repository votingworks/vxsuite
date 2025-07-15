import { H1, H3, Main, Screen } from '@votingworks/ui';
import styled from 'styled-components';
import React from 'react';
import { ElectionInfoBar } from './election_info_bar';
import { getElection, getPollbookConfigurationInformation } from './api';
import { DeviceStatusBar } from './nav_screen';

const LockedImage = styled.img`
  margin-right: auto;
  margin-bottom: 1.25em;
  margin-left: auto;
  height: 20vw;
`;

export function MachineLockedScreen(): JSX.Element | null {
  const getMachineInfoQuery = getPollbookConfigurationInformation.useQuery();
  const getElectionQuery = getElection.useQuery();

  if (!getMachineInfoQuery.isSuccess || !getElectionQuery.isSuccess) {
    return null;
  }
  const election = getElectionQuery.data.ok();
  const {
    machineId,
    codeVersion,
    electionBallotHash,
    pollbookPackageHash,
    configuredPrecinctId,
  } = getMachineInfoQuery.data;

  return (
    <Screen>
      <DeviceStatusBar showLogOutButton={false} />
      <Main centerChild>
        <div>
          <LockedImage src="/locked.svg" alt="Locked Icon" />
          <H1 align="center">VxPollBook Locked</H1>
          <H3 align="center" style={{ fontWeight: 'normal' }}>
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
        electionBallotHash={electionBallotHash}
        pollbookPackageHash={pollbookPackageHash}
        machineId={machineId}
        codeVersion={codeVersion}
        configuredPrecinctId={configuredPrecinctId}
      />
    </Screen>
  );
}
