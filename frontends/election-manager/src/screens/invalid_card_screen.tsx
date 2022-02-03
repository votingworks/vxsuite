import {
  fontSizeTheme,
  Main,
  MainChild,
  Prose,
  ElectionInfoBar,
} from '@votingworks/ui';
import React, { useContext } from 'react';
import { Screen } from '../components/screen';
import { AppContext } from '../contexts/app_context';

export function InvalidCardScreen(): JSX.Element {
  const { electionDefinition, machineConfig } = useContext(AppContext);
  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter theme={fontSizeTheme.medium} maxWidth={false}>
            <h1>Invalid Card</h1>
            <p>
              The inserted card is not valid to unlock this machine. Please
              insert a valid admin card.
            </p>
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
