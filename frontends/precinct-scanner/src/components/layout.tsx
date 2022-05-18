import React, { useContext } from 'react';
import {
  Screen,
  Main,
  Prose,
  fontSizeTheme,
  ElectionInfoBar,
  InfoBarMode,
  TestMode,
} from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';

interface CenteredScreenProps {
  children: React.ReactNode;
  infoBar?: boolean;
  isLiveMode?: boolean;
  infoBarMode?: InfoBarMode;
}

export function ScreenMainCenterChild({
  children,
  infoBar = true,
  infoBarMode,
  isLiveMode = true,
}: CenteredScreenProps): JSX.Element {
  const { electionDefinition, currentPrecinctId, machineConfig } =
    useContext(AppContext);
  return (
    <Screen>
      {!isLiveMode && <TestMode />}
      <Main padded centerChild style={{ position: 'relative' }}>
        {children}
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
