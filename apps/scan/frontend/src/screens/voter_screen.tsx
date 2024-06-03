import { ElectionDefinition, SystemSettings } from '@votingworks/types';
import { useQueryChangeListener } from '@votingworks/ui';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { acceptBallot, getScannerStatus } from '../api';
import { POLLING_INTERVAL_FOR_SCANNER_STATUS_MS } from '../config/globals';
import { useSound } from '../utils/use_sound';
import { InsertBallotScreen } from './insert_ballot_screen';
import { ScanBusyScreen } from './scan_busy_screen';
import { ScanErrorScreen } from './scan_error_screen';
import { ScanJamScreen } from './scan_jam_screen';
import { ScanProcessingScreen } from './scan_processing_screen';
import { ScanReturnedBallotScreen } from './scan_returned_ballot_screen';
import { ScanSuccessScreen } from './scan_success_screen';
import { ScanWarningScreen } from './scan_warning_screen';
import { ScanDoubleSheetScreen } from './scan_double_sheet_screen';

interface VoterScreenProps {
  electionDefinition: ElectionDefinition;
  systemSettings: SystemSettings;
  isTestMode: boolean;
  isSoundMuted: boolean;
  batteryIsCharging: boolean;
}

export function VoterScreen({
  electionDefinition,
  systemSettings,
  isTestMode,
  isSoundMuted,
  batteryIsCharging,
}: VoterScreenProps): JSX.Element | null {
  const scannerStatusQuery = getScannerStatus.useQuery({
    refetchInterval: POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
  });

  // The backend waits to receive a command accept a ballot. The frontend
  // controls when this happens for now. In the future, we should move this to
  // the backend.
  const acceptBallotMutation = acceptBallot.useMutation();
  useQueryChangeListener(scannerStatusQuery, {
    onChange: (newScannerStatus) => {
      if (newScannerStatus.state === 'ready_to_accept') {
        acceptBallotMutation.mutate();
      }
    },
  });

  // Play sounds for scan result events
  const playSuccess = useSound('success');
  const playWarning = useSound('warning');
  const playError = useSound('error');
  useQueryChangeListener(scannerStatusQuery, {
    select: ({ state }) => state,
    onChange: (newScannerState) => {
      if (isSoundMuted) return;
      switch (newScannerState) {
        case 'accepted': {
          playSuccess();
          break;
        }

        case 'needs_review':
        case 'both_sides_have_paper': {
          playWarning();
          break;
        }

        case 'rejecting':
        case 'jammed':
        case 'double_sheet_jammed':
        case 'unrecoverable_error': {
          playError();
          break;
        }

        // istanbul ignore next
        case 'connecting':
        case 'disconnected':
        case 'cover_open':
        case 'no_paper':
        case 'hardware_ready_to_scan':
        case 'paused':
        case 'scanning':
        case 'returning_to_rescan':
        case 'ready_to_accept':
        case 'accepting':
        case 'accepting_after_review':
        case 'returning':
        case 'returned':
        case 'rejected':
        case 'calibrating_double_feed_detection.double_sheet':
        case 'calibrating_double_feed_detection.single_sheet':
        case 'calibrating_double_feed_detection.done':
        case 'recovering_from_error': {
          // No sound
          break;
        }

        // istanbul ignore next - compile time check for completeness
        default: {
          throwIllegalValue(newScannerState);
        }
      }
    },
  });

  if (!scannerStatusQuery.isSuccess) {
    return null;
  }
  const scannerStatus = scannerStatusQuery.data;

  // These states are handled in AppRoot since they should show a message for
  // all user types, not just voters.
  assert(scannerStatus.state !== 'disconnected');
  assert(scannerStatus.state !== 'cover_open');
  // These states are handled in AppRoot because once calibration starts, it
  // can't be canceled (even by auth change).
  assert(
    scannerStatus.state !== 'calibrating_double_feed_detection.double_sheet' &&
      scannerStatus.state !==
        'calibrating_double_feed_detection.single_sheet' &&
      scannerStatus.state !== 'calibrating_double_feed_detection.done'
  );

  switch (scannerStatus.state) {
    // This state should pass quickly, so we don't show a message
    case 'connecting':
      return null;
    // When a user (e.g. poll worker) removes their card, there may be a slight
    // delay between when the auth status changes and the scanner unpauses, so
    // we may see the `paused` state here briefly.
    case 'paused':
    case 'no_paper':
      return (
        <InsertBallotScreen
          isLiveMode={!isTestMode}
          scannedBallotCount={scannerStatus.ballotsCounted}
          showNoChargerWarning={!batteryIsCharging}
        />
      );
    case 'hardware_ready_to_scan':
    case 'scanning':
    case 'ready_to_accept':
    case 'accepting':
    case 'returning_to_rescan':
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
          electionDefinition={electionDefinition}
          systemSettings={systemSettings}
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
    case 'double_sheet_jammed':
      return (
        <ScanDoubleSheetScreen
          scannedBallotCount={scannerStatus.ballotsCounted}
        />
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
    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(scannerStatus.state);
  }
}
