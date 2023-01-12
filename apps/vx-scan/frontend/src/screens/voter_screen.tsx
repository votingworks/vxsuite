import { useQueryChangeListener } from '@votingworks/ui';
import { assert, throwIllegalValue } from '@votingworks/utils';
import React from 'react';
import { acceptBallot, getScannerStatus, scanBallot } from '../api';
import { POLLING_INTERVAL_FOR_SCANNER_STATUS_MS } from '../config/globals';
import { InsertBallotScreen } from './insert_ballot_screen';
import { ScanBusyScreen } from './scan_busy_screen';
import { ScanErrorScreen } from './scan_error_screen';
import { ScanJamScreen } from './scan_jam_screen';
import { ScanProcessingScreen } from './scan_processing_screen';
import { ScanReturnedBallotScreen } from './scan_returned_ballot_screen';
import { ScanSuccessScreen } from './scan_success_screen';
import { ScanWarningScreen } from './scan_warning_screen';

interface VoterScreenProps {
  isTestMode: boolean;
  batteryIsCharging: boolean;
}

export function VoterScreen({
  isTestMode,
  batteryIsCharging,
}: VoterScreenProps): JSX.Element | null {
  const scannerStatusQuery = getScannerStatus.useQuery({
    refetchInterval: POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
  });

  // The scan service waits to receive a command to scan or accept a ballot. The
  // frontend controls when this happens so that ensure we're only scanning when
  // we're in voter mode.
  const scanBallotMutation = scanBallot.useMutation();
  const acceptBallotMutation = acceptBallot.useMutation();
  useQueryChangeListener(scannerStatusQuery, (newScannerStatus) => {
    if (newScannerStatus.state === 'ready_to_scan') {
      scanBallotMutation.mutate();
    } else if (newScannerStatus.state === 'ready_to_accept') {
      acceptBallotMutation.mutate();
    }
  });

  if (!scannerStatusQuery.isSuccess) {
    return null;
  }
  const scannerStatus = scannerStatusQuery.data;

  switch (scannerStatus.state) {
    case 'disconnected':
    case 'connecting':
      return null;
    case 'no_paper':
      return (
        <InsertBallotScreen
          isLiveMode={!isTestMode}
          scannedBallotCount={scannerStatus.ballotsCounted}
          showNoChargerWarning={!batteryIsCharging}
        />
      );
    case 'ready_to_scan':
    case 'scanning':
    case 'ready_to_accept':
    case 'accepting':
      return <ScanProcessingScreen />;
    case 'accepted':
      return (
        <ScanSuccessScreen scannedBallotCount={scannerStatus.ballotsCounted} />
      );
    case 'needs_review':
    case 'accepting_after_review':
      assert(scannerStatus.interpretation?.type === 'NeedsReviewSheet');
      return (
        <ScanWarningScreen
          adjudicationReasonInfo={scannerStatus.interpretation.reasons}
        />
      );
    case 'returning':
    case 'returned':
      return <ScanReturnedBallotScreen />;
    case 'rejecting':
    case 'rejected':
      return (
        <ScanErrorScreen
          error={
            scannerStatus.interpretation?.type === 'InvalidSheet'
              ? scannerStatus.interpretation.reason
              : scannerStatus.error
          }
          isTestMode={isTestMode}
          scannedBallotCount={scannerStatus.ballotsCounted}
        />
      );
    case 'jammed':
      return (
        <ScanJamScreen scannedBallotCount={scannerStatus.ballotsCounted} />
      );
    case 'both_sides_have_paper':
      return <ScanBusyScreen />;
    case 'recovering_from_error':
      return <ScanProcessingScreen />;
    case 'unrecoverable_error':
      return (
        <ScanErrorScreen
          error={scannerStatus.error}
          isTestMode={isTestMode}
          scannedBallotCount={scannerStatus.ballotsCounted}
          restartRequired
        />
      );
    // If an election manager removes their card during calibration, we'll
    // hit this case. Just show a blank screen for now, since this shouldn't
    // really happen.
    case 'calibrating':
      return null;
    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(scannerStatus.state);
  }
}
