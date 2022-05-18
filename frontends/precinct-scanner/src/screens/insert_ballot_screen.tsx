import React from 'react';
import { format } from '@votingworks/utils';
import { Text, Bar } from '@votingworks/ui';
import { Absolute } from '../components/absolute';
import { InsertBallot } from '../components/graphics';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';

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
      {showNoChargerWarning && (
        <Text warning small center>
          <strong>No Power Detected.</strong> Please ask a poll worker to plug
          in the power cord for this machine.
        </Text>
      )}
      <InsertBallot />
      <CenteredLargeProse>
        <h1>Insert Your Ballot Below</h1>
        <p>Scan one ballot sheet at a time.</p>
      </CenteredLargeProse>
      <Absolute top left>
        <Bar>
          <div>
            Ballots Scanned:{' '}
            <strong data-testid="ballot-count">
              {format.count(scannedBallotCount)}
            </strong>
          </div>
        </Bar>
      </Absolute>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function ZeroBallotsScannedTestPreview(): JSX.Element {
  return (
    <InsertBallotScreen
      isLiveMode={false}
      scannedBallotCount={0}
      showNoChargerWarning={false}
    />
  );
}

/* istanbul ignore next */
export function ManyBallotsScannedLivePreview(): JSX.Element {
  return (
    <InsertBallotScreen
      scannedBallotCount={1234}
      isLiveMode
      showNoChargerWarning={false}
    />
  );
}

/* istanbul ignore next */
export function NoPowerConnectedTestPreview(): JSX.Element {
  return (
    <InsertBallotScreen
      isLiveMode={false}
      scannedBallotCount={1234}
      showNoChargerWarning
    />
  );
}
