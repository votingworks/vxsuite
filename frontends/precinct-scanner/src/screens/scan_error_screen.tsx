import React from 'react';
import { Button, Text } from '@votingworks/ui';
import { throwIllegalValue } from '@votingworks/utils';
import { Absolute } from '../components/absolute';
import { TimesCircle } from '../components/graphics';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';
import { RejectedScanningReason } from '../config/types';

interface Props {
  dismissError?: () => void;
  rejectionReason?: RejectedScanningReason;
  isTestMode: boolean;
}

export function ScanErrorScreen({
  dismissError,
  rejectionReason,
  isTestMode,
}: Props): JSX.Element {
  let errorInformation = '';
  if (rejectionReason && rejectionReason !== RejectedScanningReason.Unknown) {
    switch (rejectionReason) {
      case RejectedScanningReason.InvalidTestMode: {
        errorInformation = isTestMode
          ? 'Live Ballot detected.'
          : 'Test ballot detected.';
        break;
      }
      case RejectedScanningReason.InvalidElectionHash: {
        errorInformation =
          'Scanned ballot does not match the election this scanner is configured for.';
        break;
      }
      case RejectedScanningReason.InvalidPrecinct: {
        errorInformation =
          'Scanned ballot does not match the precinct this scanner is configured for.';
        break;
      }
      case RejectedScanningReason.Unreadable: {
        errorInformation =
          'There was a problem reading this ballot. Please try again.';
        break;
      }
      default:
        throwIllegalValue(rejectionReason);
    }
  }
  return (
    <ScreenMainCenterChild infoBar={false}>
      <TimesCircle />
      <CenteredLargeProse>
        <h1>Scanning Error</h1>
        <p>{errorInformation}</p>
        <Text italic>Ask a poll worker for assistance.</Text>
      </CenteredLargeProse>
      {dismissError && (
        <Absolute top right padded>
          <Button onPress={dismissError}>Dismiss Error</Button>
        </Absolute>
      )}
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function UnreadablePreview(): JSX.Element {
  return (
    <ScanErrorScreen
      isTestMode={false}
      rejectionReason={RejectedScanningReason.Unreadable}
    />
  );
}

/* istanbul ignore next */
export function InvalidElectionHashPreview(): JSX.Element {
  return (
    <ScanErrorScreen
      isTestMode={false}
      rejectionReason={RejectedScanningReason.InvalidElectionHash}
    />
  );
}

/* istanbul ignore next */
export function InvalidTestModeBallotPreview(): JSX.Element {
  return (
    <ScanErrorScreen
      isTestMode={false}
      rejectionReason={RejectedScanningReason.InvalidTestMode}
    />
  );
}

/* istanbul ignore next */
export function InvalidLiveModeBallotPreview(): JSX.Element {
  return (
    <ScanErrorScreen
      isTestMode
      rejectionReason={RejectedScanningReason.InvalidTestMode}
    />
  );
}

/* istanbul ignore next */
export function InvalidPrecinctPreview(): JSX.Element {
  return (
    <ScanErrorScreen
      isTestMode={false}
      rejectionReason={RejectedScanningReason.InvalidPrecinct}
    />
  );
}

/* istanbul ignore next */
export function UnknownErrorPreview(): JSX.Element {
  return (
    <ScanErrorScreen
      isTestMode={false}
      rejectionReason={RejectedScanningReason.Unknown}
    />
  );
}
