import { ElectionDefinition, SystemSettings } from '@votingworks/types';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { getScannerStatus } from '../api';
import { POLLING_INTERVAL_FOR_SCANNER_STATUS_MS } from '../config/globals';
import { InsertBallotScreen } from './insert_ballot_screen';
import { ScanBusyScreen } from './scan_busy_screen';
import { ScanErrorScreen } from './scan_error_screen';
import { ScanJamScreen } from './scan_jam_screen';
import { ScanProcessingScreen } from './scan_processing_screen';
import { ScanReturnedBallotScreen } from './scan_returned_ballot_screen';
import { ScanSuccessScreen } from './scan_success_screen';
import { ScanWarningScreen } from './scan_warning_screen';
import { ScanDoubleSheetScreen } from './scan_double_sheet_screen';
import { useScanFeedbackAudio } from '../utils/use_scan_feedback_audio';

export interface VoterScreenProps {
  electionDefinition: ElectionDefinition;
  systemSettings: SystemSettings;
  isTestMode: boolean;
  isSoundMuted: boolean;
}

export function VoterScreen({
  electionDefinition,
  systemSettings,
  isTestMode,
  isSoundMuted,
}: VoterScreenProps): JSX.Element | null {
  const scannerStatusQuery = getScannerStatus.useQuery({
    refetchInterval: POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
  });

  useScanFeedbackAudio({
    currentState: scannerStatusQuery.data?.state,
    isSoundMuted,
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

  const sharedScreenProps = {
    isTestMode,
    scannedBallotCount: scannerStatus.ballotsCounted,
  } as const;

  switch (scannerStatus.state) {
    // This state should pass quickly, so we don't show a message
    case 'connecting':
      return null;
    // When a user (e.g. poll worker) removes their card, there may be a slight
    // delay between when the auth status changes and the scanner returns to
    // no_paper, so we may see the `paused` or `scanner_diagnostic` states here
    // briefly.
    case 'paused':
    case 'scanner_diagnostic.running':
    case 'scanner_diagnostic.done':
    case 'no_paper':
      return <InsertBallotScreen {...sharedScreenProps} />;
    case 'hardware_ready_to_scan':
    case 'scanning':
    case 'accepting':
    case 'returning_to_rescan':
      return <ScanProcessingScreen {...sharedScreenProps} />;
    case 'accepted':
      return <ScanSuccessScreen {...sharedScreenProps} />;
    case 'needs_review':
    case 'accepting_after_review':
      assert(scannerStatus.interpretation?.type === 'NeedsReviewSheet');
      return (
        <ScanWarningScreen
          electionDefinition={electionDefinition}
          systemSettings={systemSettings}
          adjudicationReasonInfo={scannerStatus.interpretation.reasons}
          {...sharedScreenProps}
        />
      );
    case 'returning':
    case 'returned':
      return <ScanReturnedBallotScreen {...sharedScreenProps} />;
    case 'rejecting':
    case 'rejected':
      return (
        <ScanErrorScreen
          error={
            scannerStatus.interpretation?.type === 'InvalidSheet'
              ? scannerStatus.interpretation.reason
              : scannerStatus.error
          }
          {...sharedScreenProps}
        />
      );
    case 'jammed':
      return (
        <ScanJamScreen error={scannerStatus.error} {...sharedScreenProps} />
      );
    case 'double_sheet_jammed':
      return <ScanDoubleSheetScreen {...sharedScreenProps} />;
    case 'both_sides_have_paper':
      return <ScanBusyScreen {...sharedScreenProps} />;
    case 'recovering_from_error':
      return <ScanProcessingScreen {...sharedScreenProps} />;
    case 'unrecoverable_error':
      return (
        <ScanErrorScreen
          error={scannerStatus.error}
          restartRequired
          {...sharedScreenProps}
        />
      );
    /* istanbul ignore next - compile time check for completeness @preserve */
    default:
      throwIllegalValue(scannerStatus.state);
  }
}
