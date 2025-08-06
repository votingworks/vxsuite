import { H1, H3, InsertCardImage, Main, Screen } from '@votingworks/ui';
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
        {configuredPrecinctId ? (
          <React.Fragment>
            <LockedImage src="/locked.svg" alt="Locked Icon" />
            <H1 align="center">VxPollBook Locked</H1>
            <H3 align="center" style={{ fontWeight: 'normal' }}>
              Insert card to unlock
            </H3>
          </React.Fragment>
        ) : getElectionQuery.data.isOk() ? (
          <React.Fragment>
            <InsertCardImage cardInsertionDirection="right" />
            <H1 align="center" style={{ maxWidth: '36rem' }}>
              Insert a system administrator or election manager card to select a
              precinct
            </H1>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <InsertCardImage cardInsertionDirection="right" />
            <H1 align="center" style={{ maxWidth: '36rem' }}>
              Insert a system administrator or election manager card to
              configure VxPollBook
            </H1>
          </React.Fragment>
        )}
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
