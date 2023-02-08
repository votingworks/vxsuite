import React from 'react';
import { Text } from '@votingworks/ui';
import { PollsState } from '@votingworks/types';
import { DoNotEnter } from '../components/graphics';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';
import { ScannedBallotCount } from '../components/scanned_ballot_count';

export interface PollsNotOpenScreenProps {
  isLiveMode: boolean;
  pollsState: Omit<PollsState, 'polls_open'>;
  showNoChargerWarning: boolean;
  scannedBallotCount: number;
}

export function PollsNotOpenScreen({
  isLiveMode,
  pollsState,
  showNoChargerWarning,
  scannedBallotCount,
}: PollsNotOpenScreenProps): JSX.Element {
  return (
    <ScreenMainCenterChild isLiveMode={isLiveMode} infoBarMode="pollworker">
      <DoNotEnter />
      <CenteredLargeProse>
        <h1>
          {pollsState === 'polls_paused' ? 'Polls Paused' : 'Polls Closed'}
        </h1>
        {pollsState === 'polls_closed_final' ? (
          <p>Voting is complete.</p>
        ) : (
          <p>Insert a poll worker card to open polls.</p>
        )}
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
    <PollsNotOpenScreen
      isLiveMode
      pollsState="polls_closed_initial"
      showNoChargerWarning={false}
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function DefaultTestModePreview(): JSX.Element {
  return (
    <PollsNotOpenScreen
      isLiveMode={false}
      pollsState="polls_closed_initial"
      showNoChargerWarning={false}
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function NoPowerConnectedPreview(): JSX.Element {
  return (
    <PollsNotOpenScreen
      isLiveMode
      pollsState="polls_closed_initial"
      showNoChargerWarning
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function PollsPausedPreview(): JSX.Element {
  return (
    <PollsNotOpenScreen
      isLiveMode
      pollsState="polls_paused"
      showNoChargerWarning={false}
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function PollsClosedFinalPreview(): JSX.Element {
  return (
    <PollsNotOpenScreen
      isLiveMode
      pollsState="polls_closed_final"
      showNoChargerWarning={false}
      scannedBallotCount={42}
    />
  );
}
