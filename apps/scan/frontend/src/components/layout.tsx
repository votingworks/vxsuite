import React from 'react';
import {
  Screen,
  Main,
  ElectionInfoBar,
  InfoBarMode,
  TestMode,
} from '@votingworks/ui';
import { getConfig, getMachineConfig, getScannerStatus } from '../api';
import { ScannedBallotCount } from './scanned_ballot_count';

interface CenteredScreenProps {
  ballotCountOverride?: number;
  children: React.ReactNode;
  isLiveMode?: boolean;
  infoBarMode?: InfoBarMode;
}

export function ScreenMainCenterChild({
  ballotCountOverride,
  children,
  infoBarMode,
  isLiveMode = true,
}: CenteredScreenProps): JSX.Element | null {
  const machineConfigQuery = getMachineConfig.useQuery();
  const configQuery = getConfig.useQuery();
  const scannerStatusQuery = getScannerStatus.useQuery();

  if (!(machineConfigQuery.isSuccess && configQuery.isSuccess)) {
    return null;
  }

  const { codeVersion, machineId } = machineConfigQuery.data;
  const { electionDefinition, precinctSelection } = configQuery.data;
  const ballotCount =
    ballotCountOverride ?? scannerStatusQuery.data?.ballotsCounted;

  return (
    <Screen>
      {!isLiveMode && <TestMode />}
      {ballotCount !== undefined && <ScannedBallotCount count={ballotCount} />}
      <Main padded centerChild style={{ position: 'relative' }}>
        {children}
      </Main>
      {electionDefinition && (
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
