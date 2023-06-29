import { ElectionDefinition } from '@votingworks/types';
import { useQueryChangeListener } from '@votingworks/ui';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { acceptBallot, getScannerStatus, scanBallot } from '../api';
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
  isTestMode: boolean;
  isSoundMuted: boolean;
  batteryIsCharging: boolean;
}

export function VoterScreen({
  electionDefinition,
  isTestMode,
  isSoundMuted,
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
    }
    if (newScannerStatus.state === 'ready_to_accept') {
      acceptBallotMutation.mutate();
    }
  });

  // Play sounds for scan result events
  const playSuccess = useSound('success');
  const playWarning = useSound('warning');
  const playError = useSound('error');
  useQueryChangeListener(
    scannerStatusQuery,
    (newScannerStatus, previousScannerStatus) => {
      if (isSoundMuted) return;
      if (newScannerStatus.state === previousScannerStatus?.state) return;
      switch (newScannerStatus.state) {
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
        default: {
          // No sound
        }
      }
    }
  );

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
