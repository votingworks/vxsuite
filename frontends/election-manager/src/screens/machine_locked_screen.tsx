import {
  fontSizeTheme,
  ElectionInfoBar,
  Main,
  MainChild,
  Prose,
  Screen,
} from '@votingworks/ui';
import React, { useContext } from 'react';
import styled from 'styled-components';
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
    <Screen flexDirection="column">
      <Main>
        <MainChild center maxWidth={false}>
          <LockedImage src="locked.svg" alt="Locked Icon" />
          <Prose textCenter theme={fontSizeTheme.medium} maxWidth={false}>
            <h1>VxAdmin is Locked</h1>
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
