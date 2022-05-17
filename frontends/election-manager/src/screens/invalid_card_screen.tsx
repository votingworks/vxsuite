import {
  fontSizeTheme,
  ElectionInfoBar,
  Main,
  Prose,
  Screen,
} from '@votingworks/ui';
import React, { useContext } from 'react';
import { AppContext } from '../contexts/app_context';

export function InvalidCardScreen(): JSX.Element {
  const { electionDefinition, machineConfig } = useContext(AppContext);
  return (
    <Screen flexDirection="column">
      <Main centerChild>
        <Prose textCenter theme={fontSizeTheme.medium} maxWidth={false}>
          <h1>Invalid Card</h1>
          <p>
            The inserted card is not valid to unlock this machine. Please insert
            a valid admin card.
          </p>
        </Prose>
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
