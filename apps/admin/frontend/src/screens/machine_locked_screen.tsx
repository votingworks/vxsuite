import { ElectionInfoBar, Main, Screen, H1, P } from '@votingworks/ui';
import React, { useContext } from 'react';
import styled from 'styled-components';
import { AppContext } from '../contexts/app_context';

const LockedImage = styled.img`
  margin-right: auto;
  margin-bottom: 1.25em;
  margin-left: auto;
  height: 20vw;
`;

export function MachineLockedScreen(): JSX.Element {
  const { electionDefinition, machineConfig } = useContext(AppContext);
  return (
    <Screen>
      <Main centerChild>
        <div>
          <LockedImage src="/locked.svg" alt="Locked Icon" />
          <H1 align="center">VxAdmin is Locked</H1>
          <P align="center">
            {electionDefinition
              ? 'Insert System Administrator or Election Manager card to unlock.'
              : 'Insert System Administrator card to unlock.'}
          </P>
        </div>
      </Main>
      {electionDefinition && (
        <ElectionInfoBar
          mode="admin"
          electionDefinition={electionDefinition}
          codeVersion={machineConfig.codeVersion}
          machineId={machineConfig.machineId}
        />
      )}
    </Screen>
  );
}
