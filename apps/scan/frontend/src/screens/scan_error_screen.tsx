import {
  Caption,
  FullScreenIconWrapper,
  Icons,
  P,
  appStrings,
} from '@votingworks/ui';
import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  PrecinctScannerErrorType,
  InvalidInterpretationReason,
} from '@votingworks/types';
import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';
import { getConfig } from '../api';

export interface Props {
  error?: InvalidInterpretationReason | PrecinctScannerErrorType;
  scannedBallotCount: number;
  restartRequired?: boolean;
}

export function ScanErrorScreen({
  error,
  scannedBallotCount,
  restartRequired = false,
}: Props): JSX.Element {
  const configQuery = getConfig.useQuery();
  const isTestMode = configQuery.data?.isTestMode ?? false;
  assert(
    error !== 'double_feed_calibration_timed_out' && // Only used in double feed calibration
      error !== 'image_sensor_calibration_timed_out' && // Only used in image sensor calibration
      error !== 'image_sensor_calibration_failed' && // Only used in image sensor calibration
      error !== 'scanner_diagnostic_failed' && // Only used in ScannerDiagnosticScreen
      error !== 'outfeed_blocked' // Only used in ScanJamScreen
  );

  const {
    title,
    errorMessage,
    pollWorkerMessage,
  }: {
    title: JSX.Element;
    errorMessage: JSX.Element;
    pollWorkerMessage?: JSX.Element;
  } = (() => {
    if (
      restartRequired ||
      !error ||
      error === 'paper_status_timed_out' ||
      error === 'scanning_timed_out' ||
      error === 'unexpected_paper_status' ||
      error === 'unexpected_event' ||
      error === 'client_error'
    ) {
      return {
        title: appStrings.titleScannerError(),
        errorMessage: appStrings.instructionsScannerAskForRestart(),
      };
    }

    switch (error) {
      // interpretation errors
      case 'vertical_streaks_detected':
        return {
          title: appStrings.titleScannerNeedsCleaning(),
          errorMessage: appStrings.warningScannerNeedsCleaning(),
          pollWorkerMessage: appStrings.instructionsAskForHelp(),
        };
      case 'unreadable':
      case 'unknown':
        return {
          title: appStrings.titleScannerBallotUnreadable(),
          errorMessage: appStrings.warningProblemScanningBallotScanAgain(),
          pollWorkerMessage: appStrings.noteAskPollWorkerForHelp(),
        };
      case 'invalid_test_mode':
        return isTestMode
          ? {
              title: appStrings.titleScannerOfficialBallot(),
              errorMessage: appStrings.warningScannerOfficialBallotInTestMode(),
              pollWorkerMessage: appStrings.instructionsAskForHelp(),
            }
          : {
              title: appStrings.titleScannerTestBallot(),
              errorMessage: appStrings.warningScannerTestBallotInOfficialMode(),
              pollWorkerMessage: appStrings.instructionsAskForHelp(),
            };
      case 'invalid_ballot_hash':
        return {
          title: appStrings.titleScannerWrongElection(),
          errorMessage: appStrings.warningScannerMismatchedElection(),
          pollWorkerMessage: appStrings.instructionsAskForHelp(),
        };
      case 'invalid_precinct':
        return {
          title: appStrings.titleScannerWrongPrecinct(),
          errorMessage: appStrings.warningScannerMismatchedPrecinct(),
          pollWorkerMessage: appStrings.instructionsAskForHelp(),
        };
      case 'bmd_ballot_scanning_disabled':
        return {
          title: appStrings.titleScannerBmdBallot(),
          errorMessage: appStrings.warningScannerBmdBallotScanningDisabled(),
          pollWorkerMessage: appStrings.instructionsAskForHelp(),
        };
      // non-restart scanner errors
      case 'double_feed_detected':
        return {
          title: appStrings.titleScannerMultipleSheetsDetected(),
          errorMessage: appStrings.instructionsScannerRemoveDoubleSheet(),
          pollWorkerMessage: appStrings.noteAskPollWorkerForHelp(),
        };
      case 'scanning_failed':
      case 'both_sides_have_paper':
      case 'paper_in_front_after_reconnect':
      case 'paper_in_back_after_reconnect':
      case 'paper_in_back_after_accept':
      case 'paper_in_both_sides_after_reconnect':
        return {
          title: appStrings.titleScannerError(),
          errorMessage: appStrings.instructionsScannerRemoveBallotToContinue(),
          pollWorkerMessage: appStrings.noteAskPollWorkerForHelp(),
        };
      case 'invalid_scale':
        return {
          title: appStrings.titleScannerBallotScaleError(),
          errorMessage: appStrings.warningBallotPrintedAtInvalidScale(),
        };
      default: {
        /* istanbul ignore next - @preserve */
        throwIllegalValue(error);
      }
    }
  })();

  return (
    <Screen
      centerContent
      showModeBanner
      ballotCountOverride={scannedBallotCount}
      voterFacing
    >
      <FullScreenPromptLayout
        title={title}
        image={
          <FullScreenIconWrapper>
            <Icons.Delete color="danger" />
          </FullScreenIconWrapper>
        }
      >
        <P weight="bold">{errorMessage}</P>
        {pollWorkerMessage && <Caption>{pollWorkerMessage}</Caption>}
      </FullScreenPromptLayout>
    </Screen>
  );
}

/* istanbul ignore next - @preserve */
export function UnreadablePreview(): JSX.Element {
  return <ScanErrorScreen error="unreadable" scannedBallotCount={42} />;
}

/* istanbul ignore next - @preserve */
export function InvalidBallotHashPreview(): JSX.Element {
  return (
    <ScanErrorScreen error="invalid_ballot_hash" scannedBallotCount={42} />
  );
}

/* istanbul ignore next - @preserve */
export function InvalidBallotTestModePreview(): JSX.Element {
  return <ScanErrorScreen error="invalid_test_mode" scannedBallotCount={42} />;
}

/* istanbul ignore next - @preserve */
export function InvalidBallotPreview(): JSX.Element {
  return <ScanErrorScreen error="invalid_test_mode" scannedBallotCount={42} />;
}

/* istanbul ignore next - @preserve */
export function InvalidPrecinctPreview(): JSX.Element {
  return <ScanErrorScreen error="invalid_precinct" scannedBallotCount={42} />;
}

/* istanbul ignore next - @preserve */
export function UnknownInterpretationErrorPreview(): JSX.Element {
  return <ScanErrorScreen error="unknown" scannedBallotCount={42} />;
}

/* istanbul ignore next - @preserve */
export function BallotInsertedWhileOtherBallotAlreadyScanningPreview(): JSX.Element {
  return (
    <ScanErrorScreen error="both_sides_have_paper" scannedBallotCount={42} />
  );
}

/* istanbul ignore next - @preserve */
export function AfterReconnectBallotInFrontPreview(): JSX.Element {
  return (
    <ScanErrorScreen
      error="paper_in_front_after_reconnect"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next - @preserve */
export function AfterReconnectBallotInBackPreview(): JSX.Element {
  return (
    <ScanErrorScreen
      error="paper_in_back_after_reconnect"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next - @preserve */
export function BallotNotDroppedAfterAcceptPreview(): JSX.Element {
  return (
    <ScanErrorScreen
      error="paper_in_back_after_accept"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next - @preserve */
export function UnexpectedScannerErrorPreview(): JSX.Element {
  return (
    <ScanErrorScreen
      error="client_error"
      scannedBallotCount={42}
      restartRequired
    />
  );
}

/* istanbul ignore next - @preserve */
export function VerticalStreaksDetectedErrorPreview(): JSX.Element {
  return (
    <ScanErrorScreen
      error="vertical_streaks_detected"
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next - @preserve */
export function DoubleSheetErrorPreview(): JSX.Element {
  return (
    <ScanErrorScreen error="double_feed_detected" scannedBallotCount={42} />
  );
}
