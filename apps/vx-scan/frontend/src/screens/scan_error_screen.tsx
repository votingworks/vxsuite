import React from 'react';
import { Text } from '@votingworks/ui';
import { throwIllegalValue } from '@votingworks/basics';
// eslint-disable-next-line vx/gts-no-import-export-type
import type {
  InvalidInterpretationReason,
  PrecinctScannerErrorType,
} from '@votingworks/vx-scan-backend';
import { TimesCircle } from '../components/graphics';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';
import { ScannedBallotCount } from '../components/scanned_ballot_count';

export interface Props {
  error?: InvalidInterpretationReason | PrecinctScannerErrorType;
  isTestMode: boolean;
  scannedBallotCount: number;
  restartRequired?: boolean;
}

export function ScanErrorScreen({
  error,
  isTestMode,
  scannedBallotCount,
  restartRequired = false,
}: Props): JSX.Element {
  const errorMessage = (() => {
    if (!error) return undefined;
    switch (error) {
      // Invalid ballot interpretations
      case 'invalid_test_mode':
        return isTestMode
          ? 'The scanner is in test mode and a live ballot was detected.'
          : 'The scanner is in live mode and a test ballot was detected.';
      case 'invalid_election_hash':
        return 'The ballot does not match the election this scanner is configured for.';
      case 'invalid_precinct':
        return 'The ballot does not match the precinct this scanner is configured for.';
      case 'unreadable':
      case 'unknown':
        return 'There was a problem scanning your ballot. Please scan it again.';
      // Precinct scanner errors
      case 'scanning_failed':
      case 'both_sides_have_paper':
      case 'paper_in_front_after_reconnect':
      case 'paper_in_back_after_reconnect':
      case 'paper_in_back_after_accept':
        return 'Remove ballot to continue.';
      case 'paper_status_timed_out':
      case 'scanning_timed_out':
      case 'unexpected_paper_status':
      case 'unexpected_event':
      case 'plustek_error':
        // These cases require restart, so we don't need to show an error
        // message, since that's handled below.
        return undefined;
      default:
        throwIllegalValue(error);
    }
  })();
  return (
    <ScreenMainCenterChild isLiveMode={!isTestMode} infoBar={false}>
      <TimesCircle />
      <CenteredLargeProse>
        <h1>Ballot Not Counted</h1>
        <p>{errorMessage}</p>
        {restartRequired ? (
          <Text>Ask a poll worker to restart the scanner.</Text>
        ) : (
          <Text small italic>
            Ask a poll worker if you need help.
          </Text>
        )}
      </CenteredLargeProse>
      <ScannedBallotCount count={scannedBallotCount} />
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function UnreadablePreview(): JSX.Element {
  return (
    <ScanErrorScreen
      isTestMode={false}
      error="unreadable"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function InvalidElectionHashPreview(): JSX.Element {
  return (
    <ScanErrorScreen
      isTestMode={false}
      error="invalid_election_hash"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function InvalidBallotTestModePreview(): JSX.Element {
  return (
    <ScanErrorScreen
      isTestMode
      error="invalid_test_mode"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function InvalidBallotPreview(): JSX.Element {
  return (
    <ScanErrorScreen
      isTestMode={false}
      error="invalid_test_mode"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function InvalidPrecinctPreview(): JSX.Element {
  return (
    <ScanErrorScreen
      isTestMode={false}
      error="invalid_precinct"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function UnknownInterpretationErrorPreview(): JSX.Element {
  return (
    <ScanErrorScreen
      isTestMode={false}
      error="unknown"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function BallotInsertedWhileOtherBallotAlreadyScanningPreview(): JSX.Element {
  return (
    <ScanErrorScreen
      isTestMode={false}
      error="both_sides_have_paper"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function AfterReconnectBallotInFrontPreview(): JSX.Element {
  return (
    <ScanErrorScreen
      isTestMode={false}
      error="paper_in_front_after_reconnect"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function AfterReconnectBallotInBackPreview(): JSX.Element {
  return (
    <ScanErrorScreen
      isTestMode={false}
      error="paper_in_back_after_reconnect"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function BallotNotDroppedAfterAcceptPreview(): JSX.Element {
  return (
    <ScanErrorScreen
      isTestMode={false}
      error="paper_in_back_after_accept"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function UnexpectedPlustekErrorPreview(): JSX.Element {
  return (
    <ScanErrorScreen
      isTestMode={false}
      error="plustek_error"
      scannedBallotCount={42}
    />
  );
}
