import {
  fontSizeTheme,
  ElectionInfoBar,
  Main,
  Prose,
  Screen,
} from '@votingworks/ui';
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
          <Prose
            textCenter
            themeDeprecated={fontSizeTheme.medium}
            maxWidth={false}
          >
            <h1>VxAdmin is Locked</h1>
            <p>
              {electionDefinition
                ? 'Insert System Administrator or Election Manager card to unlock.'
                : 'Insert System Administrator card to unlock.'}
            </p>
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
