/* stylelint-disable order/properties-order */
import React from 'react';
import {
  Screen as ScreenBase,
  Main,
  ElectionInfoBar,
  InfoBarMode,
  TestMode,
} from '@votingworks/ui';
import { getConfig, getMachineConfig, getScannerStatus } from '../api';
import { ScreenHeader } from './screen_header';

export interface ScreenProps {
  ballotCountOverride?: number;
  centerContent?: boolean;
  children: React.ReactNode;
  isLiveMode?: boolean;
  infoBarMode?: InfoBarMode;
  padded?: boolean;
}

export type CenteredScreenProps = Omit<ScreenProps, 'centered' | 'padded'>;

export function Screen(props: ScreenProps): JSX.Element | null {
  const {
    children,
    ballotCountOverride,
    centerContent,
    infoBarMode,
    isLiveMode = true,
    padded,
  } = props;
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
    <ScreenBase>
      {!isLiveMode && <TestMode />}
      <ScreenHeader
        ballotCount={electionDefinition ? ballotCount : undefined}
      />
      <Main
        padded={padded}
        centerChild={centerContent}
        style={{ position: 'relative' }}
      >
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
    </ScreenBase>
  );
}

export function ScreenMainCenterChild(
  props: CenteredScreenProps
): JSX.Element | null {
  return <Screen {...props} centerContent padded />;
}
