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
      // Invalid interpretation
      case 'invalid_test_mode':
        return isTestMode ? 'Live Ballot detected.' : 'Test ballot detected.';
      case 'invalid_election_hash':
        return 'Scanned ballot does not match the election this scanner is configured for.';
      case 'invalid_precinct':
        return 'Scanned ballot does not match the precinct this scanner is configured for.';
      case 'unreadable':
        return 'There was a problem reading this ballot. Please try again.';
      case 'unknown':
        return undefined;
      // Precinct scanner error
      case 'both_sides_have_paper':
      case 'paper_in_front_on_startup':
      case 'paper_in_back_on_startup':
      case 'paper_in_back_after_accept':
      case 'scanning_failed':
        return 'Take your ballot out of the tray and try again.';
      case 'unexpected_paper_status':
      case 'unexpected_event':
      case 'plustek_error':
        return undefined;
      default:
        throwIllegalValue(error);
    }
  })();
  return (
    <ScreenMainCenterChild infoBar={false}>
      <TimesCircle />
      <CenteredLargeProse>
        <h1>Scanning Error</h1>
        <p>{errorMessage}</p>
        <Text italic>Ask a poll worker for help.</Text>
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
export function UnknownErrorPreview(): JSX.Element {
  return <ScanErrorScreen isTestMode={false} error="unknown" />;
}
