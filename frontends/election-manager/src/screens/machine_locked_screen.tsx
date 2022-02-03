import {
  fontSizeTheme,
  Main,
  MainChild,
  Prose,
  ElectionInfoBar,
} from '@votingworks/ui';
import React, { useContext } from 'react';
import styled from 'styled-components';
import { Screen } from '../components/screen';
import { AppContext } from '../contexts/app_context';

const LockedImage = styled.img`
  margin-right: auto;
  margin-bottom: 5px;
  margin-left: auto;
  height: 20vw;
`;

export function MachineLockedScreen(): JSX.Element {
  const { electionDefinition, machineConfig } = useContext(AppContext);
  return (
    <Screen>
      <Main>
        <MainChild center>
          <LockedImage src="locked.svg" alt="Locked Icon" />
          <Prose textCenter theme={fontSizeTheme.medium} maxWidth={false}>
            <h1>Machine Locked</h1>
            <p>Insert an admin card to unlock.</p>
          </Prose>
        </MainChild>
      </Main>
      <ElectionInfoBar
        mode="admin"
        electionDefinition={electionDefinition}
        codeVersion={machineConfig.codeVersion}
        machineId={machineConfig.machineId}
      />
    </Screen>
  );
}
