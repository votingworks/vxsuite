import React from 'react';
import { Text } from '@votingworks/shared-frontend';
import { InsertBallot } from '../components/graphics';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';
import { ScannedBallotCount } from '../components/scanned_ballot_count';

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
    <ScreenMainCenterChild isLiveMode={isLiveMode}>
      <InsertBallot />
      <CenteredLargeProse>
        <h1>Insert Your Ballot Below</h1>
        <p>Scan one ballot sheet at a time.</p>
        {showNoChargerWarning && (
          <Text warning small center>
            <strong>No Power Detected.</strong> Please ask a poll worker to plug
            in the power cord.
          </Text>
        )}
      </CenteredLargeProse>
      <ScannedBallotCount count={scannedBallotCount} />
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
