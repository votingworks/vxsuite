import React from 'react';
import { Text } from '@votingworks/ui';
import { DoNotEnter } from '../components/graphics';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';
import { ScannedBallotCount } from '../components/scanned_ballot_count';

export interface PollsClosedScreenProps {
  isLiveMode: boolean;
  showNoChargerWarning: boolean;
  scannedBallotCount: number;
}

export function PollsClosedScreen({
  isLiveMode,
  showNoChargerWarning,
  scannedBallotCount,
}: PollsClosedScreenProps): JSX.Element {
  return (
    <ScreenMainCenterChild isLiveMode={isLiveMode} infoBarMode="pollworker">
      <DoNotEnter />
      <CenteredLargeProse>
        <h1>Polls Closed</h1>
        <p>Insert a poll worker card to open polls.</p>
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
export function DefaultPreview(): JSX.Element {
  return (
    <PollsClosedScreen
      isLiveMode
      showNoChargerWarning={false}
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function DefaultTestModePreview(): JSX.Element {
  return (
    <PollsClosedScreen
      isLiveMode={false}
      showNoChargerWarning={false}
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function NoPowerConnectedPreview(): JSX.Element {
  return (
    <PollsClosedScreen
      isLiveMode
      showNoChargerWarning
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function NoPowerConnectedTestModePreview(): JSX.Element {
  return (
    <PollsClosedScreen
      isLiveMode={false}
      showNoChargerWarning
      scannedBallotCount={42}
    />
  );
}
