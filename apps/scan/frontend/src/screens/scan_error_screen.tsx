import {
  Caption,
  FullScreenIconWrapper,
  Icons,
  P,
  appStrings,
  ERROR_SCREEN_MESSAGES,
} from '@votingworks/ui';
import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  PrecinctScannerErrorType,
  InvalidInterpretationReason,
} from '@votingworks/types';
import { Screen } from '../components/layout.js';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout.js';

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
    caption,
  }: {
    title: JSX.Element;
    errorMessage: JSX.Element;
    caption?: JSX.Element | string;
  } = (() => {
    if (
      restartRequired ||
      !error ||
      error === 'scanning_timed_out' ||
      error === 'unexpected_event' ||
      error === 'client_error'
    ) {
      return {
        title: appStrings.titleScannerError(),
        errorMessage: appStrings.instructionsScannerAskForRestart(),
        // No need to translate this as it's not for the voter
        caption: ERROR_SCREEN_MESSAGES.REACH_OUT,
      };
    }

    // @coverage-defer
    switch (error) {
      // interpretation errors
      case 'vertical_streaks_detected':
        return {
          title: appStrings.titleScannerNeedsCleaning(),
          errorMessage: appStrings.warningScannerNeedsCleaning(),
          caption: appStrings.instructionsAskForHelp(),
        };
      case 'unreadable':
      case 'unknown':
        return {
          title: appStrings.titleScannerBallotUnreadable(),
          errorMessage: appStrings.warningProblemScanningBallotScanAgain(),
          caption: appStrings.noteAskPollWorkerForHelp(),
        };
      case 'invalid_test_mode':
        return isTestMode
          ? {
              title: appStrings.titleScannerOfficialBallot(),
              errorMessage: appStrings.warningScannerOfficialBallotInTestMode(),
              caption: appStrings.instructionsAskForHelp(),
            }
          : {
              title: appStrings.titleScannerTestBallot(),
              errorMessage: appStrings.warningScannerTestBallotInOfficialMode(),
              caption: appStrings.instructionsAskForHelp(),
            };
      case 'invalid_ballot_hash':
        return {
          title: appStrings.titleScannerWrongElection(),
          errorMessage: appStrings.warningScannerMismatchedElection(),
          caption: appStrings.instructionsAskForHelp(),
        };
      case 'invalid_precinct':
        return {
          title: appStrings.titleScannerWrongPrecinct(),
          errorMessage: appStrings.warningScannerMismatchedPrecinct(),
          caption: appStrings.instructionsAskForHelp(),
        };
      // non-restart scanner errors
      case 'double_feed_detected':
        return {
          title: appStrings.titleScannerMultipleSheetsDetected(),
          errorMessage: appStrings.instructionsScannerRemoveDoubleSheet(),
          caption: appStrings.noteAskPollWorkerForHelp(),
        };
      case 'scanning_failed':
      case 'paper_in_front_after_reconnect':
      case 'paper_in_back_after_reconnect':
        return {
          title: appStrings.titleScannerError(),
          errorMessage: appStrings.instructionsScannerRemoveBallotToContinue(),
          caption: appStrings.noteAskPollWorkerForHelp(),
        };
      case 'invalid_scale':
        return {
          title: appStrings.titleScannerBallotScaleError(),
          errorMessage: appStrings.warningBallotPrintedAtInvalidScale(),
        };
      default: {
        throwIllegalValue(error);
      }
    }
  })();

  return (
    <Screen
      centerContent
      showTestModeBanner={isTestMode}
      ballotCountOverride={scannedBallotCount}
      voterFacing
    >
      <FullScreenPromptLayout
        title={title}
        image={
          <FullScreenIconWrapper>
            <Icons.Cancel color="danger" />
          </FullScreenIconWrapper>
        }
      >
        <P weight="bold">{errorMessage}</P>
        {caption && <Caption>{caption}</Caption>}
      </FullScreenPromptLayout>
    </Screen>
  );
}
