/* stylelint-disable order/properties-order */
import React from 'react';
import {
  Screen as ScreenBase,
  Main,
  ElectionInfoBar,
  InfoBarMode,
  TestMode,
} from '@votingworks/ui';
import { ThemeContext } from 'styled-components';
import { SizeMode } from '@votingworks/types';
import { getConfig, getMachineConfig, getScannerStatus } from '../api';
import { ScreenHeader } from './screen_header';

/**
 * At larger text sizes, the election info bar takes up too much valuable screen
 * space, so we're hiding it in cases where a voter increases text size.
 */
const ELECTION_BAR_HIDDEN_SIZE_MODES: ReadonlySet<SizeMode> = new Set(['l', 'xl']);

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

  const currentTheme = React.useContext(ThemeContext);

  if (!(machineConfigQuery.isSuccess && configQuery.isSuccess)) {
    return null;
  }

  const { codeVersion, machineId } = machineConfigQuery.data;
  const { electionDefinition, precinctSelection } = configQuery.data;
  const ballotCount =
    ballotCountOverride ?? scannerStatusQuery.data?.ballotsCounted;

  const hideInfoBar =
    !electionDefinition ||
    ELECTION_BAR_HIDDEN_SIZE_MODES.has(currentTheme.sizeMode);

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
      {!hideInfoBar && (
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
