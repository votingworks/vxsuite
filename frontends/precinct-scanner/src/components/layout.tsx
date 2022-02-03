import React, { useContext } from 'react';
import {
  Screen,
  Main,
  MainChild,
  Prose,
  fontSizeTheme,
  ElectionInfoBar,
  InfoBarMode,
} from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';

interface CenteredScreenProps {
  children: React.ReactNode;
  infoBar?: boolean;
  infoBarMode?: InfoBarMode;
}

export function CenteredScreen({
  children,
  infoBar = true,
  infoBarMode,
}: CenteredScreenProps): JSX.Element {
  const { electionDefinition, currentPrecinctId, machineConfig } = useContext(
    AppContext
  );
  return (
    <Screen flexDirection="column">
      <Main padded>
        <MainChild center maxWidth={false}>
          {children}
        </MainChild>
      </Main>
      {infoBar && (
        <ElectionInfoBar
          mode={infoBarMode}
          showPrecinctInfo
          precinctId={currentPrecinctId}
          electionDefinition={electionDefinition}
          codeVersion={machineConfig.codeVersion}
          machineId={machineConfig.machineId}
        />
      )}
    </Screen>
  );
}

interface CenteredLargeProseProps {
  children: React.ReactNode;
}

export function CenteredLargeProse({
  children,
}: CenteredLargeProseProps): JSX.Element {
  return (
    <Prose textCenter maxWidth={false} theme={fontSizeTheme.large}>
      {children}
    </Prose>
  );
}
