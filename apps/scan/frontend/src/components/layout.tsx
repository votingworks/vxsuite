import React from 'react';
import {
  Screen,
  Main,
  ElectionInfoBar,
  InfoBarMode,
  TestMode,
} from '@votingworks/ui';
import { getConfig, getMachineConfig } from '../api';

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
}: CenteredScreenProps): JSX.Element | null {
  const machineConfigQuery = getMachineConfig.useQuery();
  const configQuery = getConfig.useQuery();

  if (!(machineConfigQuery.isSuccess && configQuery.isSuccess)) {
    return null;
  }

  const { codeVersion, machineId } = machineConfigQuery.data;
  const { electionDefinition, precinctSelection } = configQuery.data;

  return (
    <Screen>
      {!isLiveMode && <TestMode />}
      <Main padded centerChild style={{ position: 'relative' }}>
        {children}
      </Main>
      {infoBar && electionDefinition && (
        <ElectionInfoBar
          mode={infoBarMode}
          precinctSelection={precinctSelection}
          electionDefinition={electionDefinition}
          codeVersion={codeVersion}
          machineId={machineId}
        />
      )}
    </Screen>
  );
}
