import React from 'react';
import { Text } from '@votingworks/ui';
import { throwIllegalValue } from '@votingworks/utils';
import { Scan } from '@votingworks/api';
import { TimesCircle } from '../components/graphics';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';

interface Props {
  error?: Scan.InvalidInterpretationReason | Scan.PrecinctScannerErrorType;
  isTestMode: boolean;
}

export function ScanErrorScreen({ error, isTestMode }: Props): JSX.Element {
  const errorMessage = (() => {
    if (!error) return undefined;
    switch (error) {
      // Invalid ballot interpretations
      case 'invalid_test_mode':
        return isTestMode
          ? 'Live ballot detected. Scanner is in test mode.'
          : 'Test ballot detected. Scanner is in live mode.';
      case 'invalid_election_hash':
        return 'The ballot does not match the election this scanner is configured for.';
      case 'invalid_precinct':
        return 'The ballot does not match the precinct this scanner is configured for.';
      case 'unreadable':
      case 'unknown':
        return 'There was a problem reading this ballot. Please scan again.';
      // Precinct scanner errors
      case 'scanning_failed':
        return 'Ballot not fully inserted. Remove ballot to continue.';
      case 'both_sides_have_paper':
        return 'Scanning interrupted. Remove ballot to continue.';
      case 'paper_in_front_on_startup':
        return 'Scanner detected an unexpected ballot in the tray. Remove ballot to continue.';
      case 'paper_in_back_on_startup':
      case 'paper_in_back_after_accept':
        return 'Scanner detected an unexpected ballot at the back of the scanner. Remove ballot to continue.';
      case 'scanning_timed_out':
      case 'unexpected_paper_status':
      case 'unexpected_event':
      case 'plustek_error':
        return 'The scanner experienced an error and needs to be reset. Please turn off and unplug the scanner from the power outlet. Plug it back in and turn it on again.';
      default:
        throwIllegalValue(error);
    }
  })();
  return (
    <ScreenMainCenterChild infoBar={false}>
      <TimesCircle />
      <CenteredLargeProse>
        <h1>Ballot Not Counted</h1>
        <p>{errorMessage}</p>
        <Text small italic>
          Ask a poll worker for help.
        </Text>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function UnreadablePreview(): JSX.Element {
  return <ScanErrorScreen isTestMode={false} error="unreadable" />;
}

/* istanbul ignore next */
export function InvalidElectionHashPreview(): JSX.Element {
  return <ScanErrorScreen isTestMode={false} error="invalid_election_hash" />;
}

/* istanbul ignore next */
export function InvalidTestModeBallotPreview(): JSX.Element {
  return <ScanErrorScreen isTestMode={false} error="invalid_test_mode" />;
}

/* istanbul ignore next */
export function InvalidLiveModeBallotPreview(): JSX.Element {
  return <ScanErrorScreen isTestMode error="invalid_test_mode" />;
}

/* istanbul ignore next */
export function InvalidPrecinctPreview(): JSX.Element {
  return <ScanErrorScreen isTestMode={false} error="invalid_precinct" />;
}

/* istanbul ignore next */
export function UnknownInterpretationErrorPreview(): JSX.Element {
  return <ScanErrorScreen isTestMode={false} error="unknown" />;
}

/* istanbul ignore next */
export function BallotInsertedWhileOtherBallotAlreadyScanningPreview(): JSX.Element {
  return <ScanErrorScreen isTestMode={false} error="both_sides_have_paper" />;
}

/* istanbul ignore next */
export function BallotInFrontOnStartupPreview(): JSX.Element {
  return (
    <ScanErrorScreen isTestMode={false} error="paper_in_front_on_startup" />
  );
}

/* istanbul ignore next */
export function BallotInBackOnStartupPreview(): JSX.Element {
  return (
    <ScanErrorScreen isTestMode={false} error="paper_in_back_on_startup" />
  );
}

/* istanbul ignore next */
export function BallotNotDroppedAfterAcceptPreview(): JSX.Element {
  return (
    <ScanErrorScreen isTestMode={false} error="paper_in_back_after_accept" />
  );
}

/* istanbul ignore next */
export function UnexpectedPlustekErrorPreview(): JSX.Element {
  return <ScanErrorScreen isTestMode={false} error="plustek_error" />;
}
