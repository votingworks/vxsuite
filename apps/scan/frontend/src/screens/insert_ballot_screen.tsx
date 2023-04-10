import React from 'react';
import {
  Caption,
  CenteredLargeProse,
  Font,
  H1,
  Icons,
  InsertBallotImage,
  P,
} from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';

interface Props {
  isLiveMode: boolean;
  scannedBallotCount: number;
  showNoChargerWarning: boolean;
}

export function InsertBallotScreen({
  isLiveMode,
  scannedBallotCount,
  showNoChargerWarning,
}: Props): JSX.Element {
  return (
    <ScreenMainCenterChild
      isLiveMode={isLiveMode}
      ballotCountOverride={scannedBallotCount}
    >
      <InsertBallotImage />
      <CenteredLargeProse>
        <H1>Insert Your Ballot Below</H1>
        <P>Scan one ballot sheet at a time.</P>
        {showNoChargerWarning && (
          <Caption color="warning">
            <Icons.Warning /> <Font weight="bold">No Power Detected.</Font>{' '}
            Please ask a poll worker to plug in the power cord.
          </Caption>
        )}
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function ZeroBallotsScannedPreview(): JSX.Element {
  return (
    <InsertBallotScreen
      scannedBallotCount={0}
      isLiveMode
      showNoChargerWarning={false}
    />
  );
}

/* istanbul ignore next */
export function ManyBallotsScannedPreview(): JSX.Element {
  return (
    <InsertBallotScreen
      scannedBallotCount={1234}
      isLiveMode
      showNoChargerWarning={false}
    />
  );
}

/* istanbul ignore next */
export function NoPowerConnectedTestModePreview(): JSX.Element {
  return (
    <InsertBallotScreen
      isLiveMode={false}
      scannedBallotCount={1234}
      showNoChargerWarning
    />
  );
}
