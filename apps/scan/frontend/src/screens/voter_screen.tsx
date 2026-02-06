import { ElectionDefinition, SystemSettings } from '@votingworks/types';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { useQueryChangeListener } from '@votingworks/ui';
import { useEffect, useRef, useState } from 'react';
import { getScannerStatus, readyForNextBallot, playSound } from '../api';
import { POLLING_INTERVAL_FOR_SCANNER_STATUS_MS } from '../config/globals';
import { InsertBallotScreen } from './insert_ballot_screen';
import { ScanBusyScreen } from './scan_busy_screen';
import { ScanErrorScreen } from './scan_error_screen';
import { ScanJamScreen } from './scan_jam_screen';
import { ScanProcessingScreen } from './scan_processing_screen';
import { ScanReturnedBallotScreen } from './scan_returned_ballot_screen';
import { ScanSuccessScreen } from './scan_success_screen';
import { ScanWarningScreen } from './scan_warning_screen';
import { useScanFeedbackAudio } from '../utils/use_scan_feedback_audio';

/**
 * How long to show the accepted screen after a ballot is accepted before
 * resetting to the insert ballot screen.
 */
export const DELAY_ACCEPTED_SCREEN_MS = 3_000;

export interface VoterScreenProps {
  electionDefinition: ElectionDefinition;
  systemSettings: SystemSettings;
  isTestMode: boolean;
  isEarlyVotingMode: boolean;
  isSoundMuted: boolean;
}

export function VoterScreen({
  electionDefinition,
  systemSettings,
  isTestMode,
  isEarlyVotingMode,
  isSoundMuted,
}: VoterScreenProps): JSX.Element | null {
  const scannerStatusQuery = getScannerStatus.useQuery({
    refetchInterval: (status) =>
      // In order to make the perceived speed of scanning as fast as possible,
      // we poll more frequently when a scan is in progress so we can find out
      // promptly when it's done. Experimentally, 100ms hit a sweet spot between
      // finding out quickly and adding too much overhead.
      status?.state === 'scanning'
        ? 100
        : POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
  });
  const playSoundMutate = playSound.useMutation().mutate;

  useScanFeedbackAudio({
    currentState: scannerStatusQuery.data?.state,
    isSoundMuted,
    playSound: playSoundMutate,
  });

  // When a ballot is accepted, show the accepted screen for a few seconds.
  // Once we're sure that the accepted screen is shown, tell the backend to
  // re-enable scanning (in case a user wants to insert another ballot right
  // away). This will transition the scanner to the `waiting_for_ballot` state,
  // so we use a separate local state variable to track how long to show the
  // accepted screen.
  const readyForNextBallotMutation = readyForNextBallot.useMutation();
  const [isShowingAcceptedScreen, setIsShowingAcceptedScreen] = useState(false);
  const acceptedScreenTimeoutRef = useRef<number>();
  function clearTimeout() {
    if (acceptedScreenTimeoutRef.current) {
      window.clearTimeout(acceptedScreenTimeoutRef.current);
    }
  }
  useQueryChangeListener(scannerStatusQuery, {
    select: (status) => status.state,
    onChange: (newState) => {
      if (newState === 'accepted') {
        setIsShowingAcceptedScreen(true);
        clearTimeout();
        acceptedScreenTimeoutRef.current = window.setTimeout(
          () => setIsShowingAcceptedScreen(false),
          DELAY_ACCEPTED_SCREEN_MS
        );
        readyForNextBallotMutation.mutate();
      }
    },
  });
  useEffect(() => clearTimeout, []); // Cleanup on unmount

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
      scannerStatus.state !== 'calibrating_double_feed_detection.done' &&
      scannerStatus.state !== 'calibrating_image_sensors.calibrating' &&
      scannerStatus.state !== 'calibrating_image_sensors.done'
  );

  const sharedScreenProps = {
    isTestMode,
    isEarlyVotingMode,
    scannedBallotCount: scannerStatus.ballotsCounted,
  } as const;

  switch (scannerStatus.state) {
    // This state should pass quickly, so we don't show a message
    case 'connecting':
      return null;
    // When a user (e.g. poll worker) removes their card, there may be a slight
    // delay between when the auth status changes and the scanner returns to
    // waiting_for_ballot, so we may see the `paused` or `scanner_diagnostic`
    // states here briefly.
    case 'paused':
    case 'scanner_diagnostic.running':
    case 'scanner_diagnostic.done':
    case 'waiting_for_ballot': {
      if (isShowingAcceptedScreen) {
        return <ScanSuccessScreen {...sharedScreenProps} />;
      }
      return <InsertBallotScreen {...sharedScreenProps} />;
    }
    case 'scanning':
    case 'accepting':
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
    case 'both_sides_have_paper':
      return <ScanBusyScreen {...sharedScreenProps} />;
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
