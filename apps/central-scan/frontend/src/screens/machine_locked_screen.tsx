import {
  ElectionInfoBar,
  fontSizeTheme,
  Main,
  Prose,
  Screen,
} from '@votingworks/shared-frontend';
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
      <Main padded centerChild>
        <div>
          <LockedImage src="/locked.svg" alt="Locked Icon" />
          <Prose
            textCenter
            themeDeprecated={fontSizeTheme.medium}
            maxWidth={false}
          >
            {electionDefinition ? (
              <React.Fragment>
                <h1>VxCentralScan is Locked</h1>
                <p>Insert Election Manager card to unlock.</p>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <h1>VxCentralScan is Not Configured</h1>
                <p>Insert Election Manager card to configure.</p>
              </React.Fragment>
            )}
          </Prose>
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
