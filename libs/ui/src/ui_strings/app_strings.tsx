/* eslint-disable react/no-unescaped-entities */

import { Font } from '../typography';
import { UiString } from './ui_string';

// TODO(kofi): Add lint rule to ensure object keys match uiStringKey props.

// After updating this file, run `pnpm build[:app-strings-catalog]` from `libs/ui`
// to generate libs/ui/src/ui_strings/app_strings_catalog/latest.json

export const appStrings = {
  audioFeedback10PercentVolume: () => (
    <UiString uiStringKey="audioFeedback10PercentVolume">10% volume</UiString>
  ),

  audioFeedback20PercentVolume: () => (
    <UiString uiStringKey="audioFeedback20PercentVolume">20% volume</UiString>
  ),

  audioFeedback30PercentVolume: () => (
    <UiString uiStringKey="audioFeedback30PercentVolume">30% volume</UiString>
  ),

  audioFeedback40PercentVolume: () => (
    <UiString uiStringKey="audioFeedback40PercentVolume">40% volume</UiString>
  ),

  audioFeedback50PercentVolume: () => (
    <UiString uiStringKey="audioFeedback50PercentVolume">50% volume</UiString>
  ),

  audioFeedback60PercentVolume: () => (
    <UiString uiStringKey="audioFeedback60PercentVolume">60% volume</UiString>
  ),

  audioFeedback70PercentVolume: () => (
    <UiString uiStringKey="audioFeedback70PercentVolume">70% volume</UiString>
  ),

  audioFeedback80PercentVolume: () => (
    <UiString uiStringKey="audioFeedback80PercentVolume">80% volume</UiString>
  ),

  audioFeedback90PercentVolume: () => (
    <UiString uiStringKey="audioFeedback90PercentVolume">90% volume</UiString>
  ),

  audioFeedbackMaximumVolume: () => (
    <UiString uiStringKey="audioFeedbackMaximumVolume">Maximum volume</UiString>
  ),

  audioFeedbackMinimumVolume: () => (
    <UiString uiStringKey="audioFeedbackMinimumVolume">Minimum volume</UiString>
  ),

  bmdPatDeviceInputNameMove: () => (
    <UiString uiStringKey="bmdPatDeviceInputNameMove">"Move"</UiString>
  ),

  bmdPatDeviceInputNameSelect: () => (
    <UiString uiStringKey="bmdPatDeviceInputNameSelect">"Select"</UiString>
  ),

  buttonAccept: () => <UiString uiStringKey="buttonAccept">Accept</UiString>,

  buttonAddWriteIn: () => (
    <UiString uiStringKey="buttonAddWriteIn">add write-in candidate</UiString>
  ),

  buttonAudioMute: () => (
    <UiString uiStringKey="buttonAudioMute">Mute Audio</UiString>
  ),

  buttonAudioUnmute: () => (
    <UiString uiStringKey="buttonAudioUnmute">Unmute Audio</UiString>
  ),

  buttonBack: () => <UiString uiStringKey="buttonBack">Back</UiString>,

  buttonBallotIsCorrect: () => (
    <UiString uiStringKey="buttonBallotIsCorrect">Cast My Ballot</UiString>
  ),

  buttonBallotIsIncorrect: () => (
    <UiString uiStringKey="buttonBallotIsIncorrect">
      My Ballot is Incorrect
    </UiString>
  ),

  buttonBmdReviewCardAction: () => (
    <UiString uiStringKey="buttonBmdReviewCardAction">
      Press the select button to change your votes for this contest.
    </UiString>
  ),

  buttonBmdReviewCardActionPatDevice: () => (
    <UiString uiStringKey="buttonBmdReviewCardActionPatDevice">
      Use the select input to change your votes for this contest.
    </UiString>
  ),

  buttonBmdSkipPatCalibration: () => (
    <UiString uiStringKey="buttonBmdSkipPatCalibration">
      Skip Identification
    </UiString>
  ),

  buttonCancel: () => <UiString uiStringKey="buttonCancel">Cancel</UiString>,

  buttonCastBallot: () => (
    <UiString uiStringKey="buttonCastBallot">Cast Ballot</UiString>
  ),

  buttonChange: () => <UiString uiStringKey="buttonChange">Change</UiString>,

  buttonClose: () => <UiString uiStringKey="buttonClose">Close</UiString>,

  buttonContinue: () => (
    <UiString uiStringKey="buttonContinue">Continue</UiString>
  ),

  buttonDone: () => <UiString uiStringKey="buttonDone">Done</UiString>,

  buttonEnableAudioOnlyMode: () => (
    <UiString uiStringKey="buttonEnableAudioOnlyMode">
      Enable Audio-Only Mode
    </UiString>
  ),

  buttonExitAudioOnlyMode: () => (
    <UiString uiStringKey="buttonExitAudioOnlyMode">
      Exit Audio-Only Mode
    </UiString>
  ),

  buttonMore: () => <UiString uiStringKey="buttonMore">More</UiString>,

  buttonNext: () => <UiString uiStringKey="buttonNext">Next</UiString>,

  buttonNo: () => <UiString uiStringKey="buttonNo">No</UiString>,

  buttonStillVoting: () => (
    <UiString uiStringKey="buttonStillVoting">Yes, I’m still voting.</UiString>
  ),

  buttonOkay: () => <UiString uiStringKey="buttonOkay">Okay</UiString>,

  buttonReset: () => <UiString uiStringKey="buttonReset">Reset</UiString>,

  buttonPrintBallot: () => (
    <UiString uiStringKey="buttonPrintBallot">Print My Ballot</UiString>
  ),

  buttonReturnBallot: () => (
    <UiString uiStringKey="buttonReturnBallot">Return Ballot</UiString>
  ),

  buttonReturnToBallotReview: () => (
    <UiString uiStringKey="buttonReturnToBallotReview">
      Return to Ballot Review
    </UiString>
  ),

  buttonReview: () => <UiString uiStringKey="buttonReview">Review</UiString>,

  buttonStartVoting: () => (
    <UiString uiStringKey="buttonStartVoting">Start Voting</UiString>
  ),

  buttonViewContests: () => (
    <UiString uiStringKey="buttonViewContests">View Contests</UiString>
  ),

  buttonVoterSettings: () => (
    <UiString uiStringKey="buttonVoterSettings">Settings</UiString>
  ),

  buttonYes: () => <UiString uiStringKey="buttonYes">Yes</UiString>,

  helpBmdControllerButtonFocusNext: () => (
    <UiString uiStringKey="helpBmdControllerButtonFocusNext">
      This is the Down button, for focusing on the next item in a list of
      options on a page. You can use the Up and Down buttons to move through
      candidates in a contest.
    </UiString>
  ),

  helpBmdControllerButtonFocusPrevious: () => (
    <UiString uiStringKey="helpBmdControllerButtonFocusPrevious">
      This is the Up button, for focusing on the previous item in a list of
      options on a page. You can use the Up and Down buttons to move through
      candidates in a contest.
    </UiString>
  ),

  helpBmdControllerButtonPageNext: () => (
    <UiString uiStringKey="helpBmdControllerButtonPageNext">
      This is the Right button, for moving to the next page or contest. You can
      use the Left and Right buttons to move through all the contests on your
      ballot.
    </UiString>
  ),

  helpBmdControllerButtonPagePrevious: () => (
    <UiString uiStringKey="helpBmdControllerButtonPagePrevious">
      This is the Left button, for returning to the previous page or contest.
      You can use the Left and Right buttons to move through all the contests on
      your ballot.
    </UiString>
  ),

  helpBmdControllerButtonPlaybackRateDown: () => (
    <UiString uiStringKey="helpBmdControllerButtonPlaybackRateDown">
      This button reduces the playback rate of the text-to-speech audio.
    </UiString>
  ),

  helpBmdControllerButtonPlaybackRateUp: () => (
    <UiString uiStringKey="helpBmdControllerButtonPlaybackRateUp">
      This button increases the playback rate of the text-to-speech audio.
    </UiString>
  ),

  helpBmdControllerButtonSelect: () => (
    <UiString uiStringKey="helpBmdControllerButtonSelect">
      This is the Select button. Use this button to mark your vote for a
      candidate or a yes or no option. Pressing the Select button again will
      remove your previous vote.
    </UiString>
  ),

  helpBmdControllerButtonToggleHelp: () => (
    <UiString uiStringKey="helpBmdControllerButtonToggleHelp">
      This is the Help button. Press this button again to return to filling out
      your ballot.
    </UiString>
  ),

  helpBmdControllerButtonTogglePause: () => (
    <UiString uiStringKey="helpBmdControllerButtonTogglePause">
      This is the Pause button. Use this button to pause the text-to-speech
      audio. Pressing the Pause button again will resume the text-to-speech
      audio.
    </UiString>
  ),

  helpBmdControllerButtonVolumeDown: () => (
    <UiString uiStringKey="helpBmdControllerButtonVolumeDown">
      This button reduces the volume of the text-to-speech audio.
    </UiString>
  ),

  helpBmdControllerButtonVolumeUp: () => (
    <UiString uiStringKey="helpBmdControllerButtonVolumeUp">
      This button increases the volume of the text-to-speech audio.
    </UiString>
  ),

  instructionsAskForHelp: () => (
    <UiString uiStringKey="instructionsAskForHelp">
      Please ask a poll worker for help.
    </UiString>
  ),

  instructionsAskPollWorkerToPlugInPower: () => (
    <UiString uiStringKey="instructionsAskPollWorkerToPlugInPower">
      Please ask a poll worker to plug in the power cord.
    </UiString>
  ),

  instructionsAudioMuteButton: () => (
    <UiString uiStringKey="instructionsAudioMuteButton">
      Press the select button to mute all audio.
    </UiString>
  ),

  instructionsBmdAskForRestart: () => (
    <UiString uiStringKey="instructionsBmdAskForRestart">
      Ask a poll worker to restart the machine.
    </UiString>
  ),

  instructionsBmdBallotNavigationMark: () => (
    <UiString uiStringKey="instructionsBmdBallotNavigationMark">
      When voting with the text-to-speech audio, use the accessible controller
      to navigate your ballot. To navigate through the contests, use the left
      and right buttons. To navigate through contest choices, use the up and
      down buttons. To select or unselect a contest choice as your vote, use the
      select button. Press the right button now to advance to the first contest.
    </UiString>
  ),

  instructionsBmdBallotNavigationMarkScan: () => (
    <UiString uiStringKey="instructionsBmdBallotNavigationMarkScan">
      When voting with the text-to-speech audio, use the accessible controller
      to navigate your ballot. There are four navigation arrow buttons located
      near the center of the controller. To navigate through the contests, use
      the left and right arrows. To navigate through contest choices, use the up
      and down arrows. To select or unselect a contest choice as your vote, use
      the circle Select button to the right of the navigation buttons. You can
      find two volume controls at the top right corner of the controller. The
      minus button reduces the volume of your audio and the plus button
      increases the volume. To change the speech rate of your audio, use the two
      buttons at the bottom right corner of the controller. The down arrow
      button reduces the speech rate and the up arrow button increases it. To
      pause or unpause the audio at any time, use the pause button at the bottom
      left corner of the controller. If you need more information on how to use
      the controller, press the question mark button at the top left corner at
      any time. To repeat any content, navigate back to previous content using
      the up or left arrows. Press the right button now to advance to the first
      contest.
    </UiString>
  ),

  instructionsBmdBallotNavigationMarkScanPatDevice: () => (
    <UiString uiStringKey="instructionsBmdBallotNavigationMarkScanPatDevice">
      When voting with the text-to-speech audio, use your personal assistive
      device to navigate your ballot. To navigate through contest choices, use
      the move input. To select or unselect a contest choice as your vote, use
      the select input. To navigate through the contests, use the move input to
      navigate to the controls labelled "next" and "back" and use the select
      input. After marking your votes in a contest, focus will automatically
      move to the "next" control for your convenience. To get started, use the
      move input to navigate to the control labelled "start voting" and then use
      the select input to advance to the first contest.
    </UiString>
  ),

  instructionsBmdCastBallotPreamble: () => (
    <UiString uiStringKey="instructionsBmdCastBallotPreamble">
      Your official ballot is printing. Complete the following steps to finish
      voting:
    </UiString>
  ),

  instructionsBmdCastBallotPreamblePostPrint: () => (
    <UiString uiStringKey="instructionsBmdCastBallotPreamblePostPrint">
      Your official ballot has been removed from the printer. Complete the
      following steps to finish voting:
    </UiString>
  ),

  instructionsBmdCastBallotStep1: () => (
    <UiString uiStringKey="instructionsBmdCastBallotStep1">
      1. Verify your official ballot.
    </UiString>
  ),

  instructionsBmdCastBallotStep2: () => (
    <UiString uiStringKey="instructionsBmdCastBallotStep2">
      2. Scan your official ballot.
    </UiString>
  ),

  instructionsBmdClosePrinterCover: () => (
    <UiString uiStringKey="instructionsBmdClosePrinterCover">
      The printer cover is open and must be closed to continue voting.
    </UiString>
  ),

  instructionsBmdContestNavigation: () => (
    <UiString uiStringKey="instructionsBmdContestNavigation">
      To navigate through the contest choices, use the down button. To move to
      the next contest, use the right button.
    </UiString>
  ),

  instructionsBmdContestNavigationPatDevice: () => (
    <UiString uiStringKey="instructionsBmdContestNavigationPatDevice">
      To navigate through the contest choices, use the move input. To advance to
      the next contest, use the move input to navigate to the control labelled
      "next" and then use the select input to continue.
    </UiString>
  ),

  instructionsBmdControllerSandboxMarkScan: () => (
    <UiString uiStringKey="instructionsBmdControllerSandboxMarkScan">
      Press any button on the controller to learn what it is and how to use it.
      When you're done, press the question mark shaped “Help” button at the top
      left corner of the controller again to return to your ballot.
    </UiString>
  ),

  instructionsBmdInsertBallotFaceUp: () => (
    <UiString uiStringKey="instructionsBmdInsertBallotFaceUp">
      Be sure to insert the sheet with the printed side facing upwards.
    </UiString>
  ),

  instructionsBmdInsertPreviouslyPrintedBallot: () => (
    <UiString uiStringKey="instructionsBmdInsertPreviouslyPrintedBallot">
      Please remove the sheet and insert the previously printed ballot.
    </UiString>
  ),

  instructionsBmdInvalidatedBallot: () => (
    <UiString uiStringKey="instructionsBmdInvalidatedBallot">
      You have indicated your ballot needs changes.
    </UiString>
  ),

  instructionsBmdPaperJam: () => (
    <UiString uiStringKey="instructionsBmdPaperJam">
      Please alert a poll worker to clear the jam.
    </UiString>
  ),

  instructionsBmdPatCalibrationConfirmExitScreen: () => (
    <UiString uiStringKey="instructionsBmdPatCalibrationConfirmExitScreen">
      You may continue with voting or go back to the previous screen.
    </UiString>
  ),

  instructionsBmdPatCalibrationIntroStep: () => (
    <UiString uiStringKey="instructionsBmdPatCalibrationIntroStep">
      Activate either input to continue.
    </UiString>
  ),

  instructionsBmdPatCalibrationActivateInput: () => (
    <UiString uiStringKey="instructionsBmdPatCalibrationActivateInput">
      Activate the input to continue.
    </UiString>
  ),

  instructionsBmdPatCalibrationActivateInputAgain: () => (
    <UiString uiStringKey="instructionsBmdPatCalibrationActivateInputAgain">
      Activate the input again to continue.
    </UiString>
  ),

  instructionsBmdPatCalibrationTryInput: () => (
    <UiString uiStringKey="instructionsBmdPatCalibrationTryInput">
      Try an input to continue.
    </UiString>
  ),

  instructionsBmdPatCalibrationActivateOtherInput: () => (
    <UiString uiStringKey="instructionsBmdPatCalibrationActivateOtherInput">
      Activate the other input.
    </UiString>
  ),

  instructionsBmdPrintScreenNoBallotRemoval: () => (
    <UiString uiStringKey="instructionsBmdPrintScreenNoBallotRemoval">
      Do not remove the ballot once it's printed.
    </UiString>
  ),

  instructionsBmdReinsertBallot: () => (
    <UiString uiStringKey="instructionsBmdReinsertBallot">
      Please re-insert the printed sheet to cast your ballot and finish voting.
    </UiString>
  ),

  instructionsBmdReviewAndValidatePrintedBallot: () => (
    <UiString uiStringKey="instructionsBmdReviewAndValidatePrintedBallot">
      The following votes were scanned from your printed official ballot. Please
      review the selections in each contest and verify that they are correct to
      cast your ballot.
    </UiString>
  ),

  instructionsBmdReviewPageNavigation: () => (
    <UiString uiStringKey="instructionsBmdReviewPageNavigation">
      To review your votes, advance through the ballot contests using the up and
      down buttons.
    </UiString>
  ),

  instructionsBmdReviewPageNavigationPatDevice: () => (
    <UiString uiStringKey="instructionsBmdReviewPageNavigationPatDevice">
      To review your votes, advance through the ballot contests using the move
      input.
    </UiString>
  ),

  instructionsBmdReviewPageChangingVotes: () => (
    <UiString uiStringKey="instructionsBmdReviewPageChangingVotes">
      To change your vote in any contest, use the select button to navigate to
      that contest. When you are finished making your ballot selections and
      ready to print your ballot, use the right button to print your ballot.
    </UiString>
  ),

  instructionsBmdReviewPageChangingVotesPatDevice: () => (
    <UiString uiStringKey="instructionsBmdReviewPageChangingVotesPatDevice">
      To change your vote in any contest, use the select input to navigate to
      that contest. When you are finished making your ballot selections and
      ready to print your ballot, use the move input to navigate to the control
      labelled "print my ballot" and then use the select input to start
      printing.
    </UiString>
  ),

  instructionsBmdConfirmPrintingBallot: () => (
    <UiString uiStringKey="instructionsBmdConfirmPrintingBallot">
      Press the select button to confirm your selections and print your ballot.
    </UiString>
  ),

  instructionsBmdConfirmPrintingBallotPatDevice: () => (
    <UiString uiStringKey="instructionsBmdConfirmPrintingBallotPatDevice">
      Use the select input to confirm your selections and print your ballot.
    </UiString>
  ),

  instructionsBmdConfirmCastingBallot: () => (
    <UiString uiStringKey="instructionsBmdConfirmCastingBallot">
      Press the select button to confirm your selections are correct and cast
      your ballot.
    </UiString>
  ),

  instructionsBmdConfirmCastingBallotPatDevice: () => (
    <UiString uiStringKey="instructionsBmdConfirmCastingBallotPatDevice">
      Use the select input to confirm your selections are correct and cast your
      ballot.
    </UiString>
  ),

  instructionsBmdScanReviewConfirmation: () => (
    <UiString uiStringKey="instructionsBmdScanReviewConfirmation">
      If your selections are correct, press the Right button to confirm your
      choices and cast your ballot. If there is an error, press the Left button
      to mark this ballot as incorrect and alert a poll worker.
    </UiString>
  ),

  instructionsBmdScanReviewConfirmationPatDevice: () => (
    <UiString uiStringKey="instructionsBmdScanReviewConfirmationPatDevice">
      If your selections are correct, use the move input to navigate to the
      control labelled "cast my ballot" and then use the select input to confirm
      your choices and cast your ballot. If there is an error, select the option
      labelled "my ballot is incorrect" to mark this ballot as incorrect and
      alert a poll worker.
    </UiString>
  ),

  instructionsBmdSelectToContinue: () => (
    <UiString uiStringKey="instructionsBmdSelectToContinue">
      Press the select button to continue.
    </UiString>
  ),

  instructionsBmdNextToContinue: () => (
    <UiString uiStringKey="instructionsBmdNextToContinue">
      Press the right button to continue.
    </UiString>
  ),

  instructionsBmdSelectToContinuePatDevice: () => (
    <UiString uiStringKey="instructionsBmdSelectToContinuePatDevice">
      Use the select input to continue.
    </UiString>
  ),

  instructionsBmdMoveToSelectToContinuePatDevice: () => (
    <UiString uiStringKey="instructionsBmdMoveToSelectToContinuePatDevice">
      Use the move input to select the Okay button and then use the select input
      to continue.
    </UiString>
  ),

  instructionsBmdWriteInFormNavigation: () => (
    <UiString uiStringKey="instructionsBmdWriteInFormNavigation">
      Use the up and down buttons to navigate between the letters of a standard
      keyboard. Use the select button to select the current letter.
    </UiString>
  ),

  instructionsBmdWriteInFormNavigationPatDevice: () => (
    <UiString uiStringKey="instructionsBmdWriteInFormNavigationPatDevice">
      Use the move input to navigate between the letters of a standard keyboard.
      Use the select input to select the current letter.
    </UiString>
  ),

  instructionsLanguageSettingsButton: () => (
    <UiString uiStringKey="instructionsLanguageSettingsButton">
      Press the Select button to change your ballot language.
    </UiString>
  ),

  instructionsLanguageSettingsScreen: () => (
    <UiString uiStringKey="instructionsLanguageSettingsScreen">
      Use the up and down buttons to navigate through the available ballot
      languages. To select a language, use the select button. When you're done,
      use the right button to continue voting.
    </UiString>
  ),

  instructionsLanguageSettingsScreenPatDevice: () => (
    <UiString uiStringKey="instructionsLanguageSettingsScreenPatDevice">
      Use the move input to navigate through the available ballot languages. To
      select a language, use the select input. When you're done, use the move
      input to navigate to the control labelled "done" and then use the select
      input to continue voting.
    </UiString>
  ),

  instructionsScannerAskForRestart: () => (
    <UiString uiStringKey="instructionsScannerAskForRestart">
      Ask a poll worker to restart the scanner.
    </UiString>
  ),

  instructionsScannerInsertBallotScreen: () => (
    <UiString uiStringKey="instructionsScannerInsertBallotScreen">
      Scan one ballot sheet at a time.
    </UiString>
  ),

  instructionsScannerRemoveBallotToContinue: () => (
    <UiString uiStringKey="instructionsScannerRemoveBallotToContinue">
      Remove ballot to continue.
    </UiString>
  ),

  instructionsScannerRemoveDoubleSheet: () => (
    <UiString uiStringKey="instructionsScannerRemoveDoubleSheet">
      Remove your ballot and insert one sheet at a time.
    </UiString>
  ),

  labelAllPrecinctsSelection: () => (
    <UiString uiStringKey="labelAllPrecinctsSelection">All Precincts</UiString>
  ),

  labelNumSheetsScanned: () => (
    <UiString uiStringKey="labelNumSheetsScanned">Sheets Scanned</UiString>
  ),

  labelBallotStyle: () => (
    <UiString uiStringKey="labelBallotStyle">Ballot Style:</UiString>
  ),

  labelBmdPatCalibrationInputIdentified: () => (
    <UiString uiStringKey="labelBmdPatCalibrationInputIdentified">
      Input Identified:
    </UiString>
  ),

  labelBmdPatCalibrationInputActivated: () => (
    <UiString uiStringKey="labelBmdPatCalibrationInputActivated">
      Input Activated:
    </UiString>
  ),

  labelBmdSecondsRemaining: () => (
    <UiString uiStringKey="labelBmdSecondsRemaining">
      Number of seconds remaining:
    </UiString>
  ),

  labelBmdWriteInForm: () => (
    <UiString uiStringKey="labelBmdWriteInForm">
      Enter the name of a person who is <Font weight="bold">not</Font> on the
      ballot:
    </UiString>
  ),

  labelCharactersRemaining: () => (
    <UiString uiStringKey="labelCharactersRemaining">
      Characters remaining:
    </UiString>
  ),

  labelContestsRemaining: () => (
    <UiString uiStringKey="labelContestsRemaining">
      Contests remaining:
    </UiString>
  ),

  labelContestNumber: () => (
    <UiString uiStringKey="labelContestNumber">Contest number:</UiString>
  ),

  labelContestsWithNoVotes: () => (
    <UiString uiStringKey="labelContestsWithNoVotes">
      Contests with no votes marked:
    </UiString>
  ),

  labelContestsWithTooManyVotes: () => (
    <UiString uiStringKey="labelContestsWithTooManyVotes">
      Contests with too many votes marked:
    </UiString>
  ),

  labelContestsWithVotesRemaining: () => (
    <UiString uiStringKey="labelContestsWithVotesRemaining">
      Contests with one or more votes remaining:
    </UiString>
  ),

  labelCurrentLanguage: () => (
    <UiString uiStringKey="labelCurrentLanguage">Current Language:</UiString>
  ),

  labelDeselected: () => (
    <UiString uiStringKey="labelDeselected">Deselected:</UiString>
  ),

  labelDeselectedOption: () => (
    <UiString uiStringKey="labelDeselectedOption">Deselected option:</UiString>
  ),

  labelEitherNeitherContestEitherNeitherSection: () => (
    <UiString uiStringKey="labelEitherNeitherContestEitherNeitherSection">
      VOTE FOR APPROVAL OF EITHER, OR AGAINST BOTH
    </UiString>
  ),

  labelEitherNeitherContestPickOneSection: () => (
    <UiString uiStringKey="labelEitherNeitherContestPickOneSection">
      AND VOTE FOR ONE
    </UiString>
  ),

  labelKeyboardComma: () => (
    <UiString uiStringKey="labelKeyboardComma">,</UiString>
  ),

  labelKeyboardDelete: () => (
    <UiString uiStringKey="labelKeyboardDelete">delete</UiString>
  ),

  labelKeyboardDoubleQuote: () => (
    <UiString uiStringKey="labelKeyboardDoubleQuote">"</UiString>
  ),

  labelKeyboardHyphen: () => (
    <UiString uiStringKey="labelKeyboardHyphen">-</UiString>
  ),

  labelKeyboardPeriod: () => (
    <UiString uiStringKey="labelKeyboardPeriod">.</UiString>
  ),

  labelKeyboardSingleQuote: () => (
    <UiString uiStringKey="labelKeyboardSingleQuote">'</UiString>
  ),

  labelKeyboardSpaceBar: () => (
    <UiString uiStringKey="labelKeyboardSpaceBar">space</UiString>
  ),

  labelNumBallotContests: () => (
    <UiString uiStringKey="labelNumBallotContests">
      Number of contests on your ballot:
    </UiString>
  ),

  labelNumVotesRemaining: () => (
    <UiString uiStringKey="labelNumVotesRemaining">
      Votes remaining in this contest:
    </UiString>
  ),

  labelNumVotesUnused: () => (
    <UiString uiStringKey="labelNumVotesUnused">
      Number of unused votes:
    </UiString>
  ),

  labelSelected: () => (
    <UiString uiStringKey="labelSelected">Selected:</UiString>
  ),

  labelSelectedOption: () => (
    <UiString uiStringKey="labelSelectedOption">Selected option:</UiString>
  ),

  labelThemesContrastHighDark: () => (
    <UiString uiStringKey="labelThemesContrastHighDark">
      White text, black background
    </UiString>
  ),

  labelThemesContrastHighLight: () => (
    <UiString uiStringKey="labelThemesContrastHighLight">
      Black text, white background
    </UiString>
  ),

  labelThemesContrastLow: () => (
    <UiString uiStringKey="labelThemesContrastLow">
      Gray text, dark background
    </UiString>
  ),

  labelThemesContrastMedium: () => (
    <UiString uiStringKey="labelThemesContrastMedium">
      Dark text, light background
    </UiString>
  ),

  labelThemesSizeExtraLarge: () => (
    <UiString uiStringKey="labelThemesSizeExtraLarge">Extra-Large</UiString>
  ),

  labelThemesSizeLarge: () => (
    <UiString uiStringKey="labelThemesSizeLarge">Large</UiString>
  ),

  labelThemesSizeMedium: () => (
    <UiString uiStringKey="labelThemesSizeMedium">Medium</UiString>
  ),

  labelThemesSizeSmall: () => (
    <UiString uiStringKey="labelThemesSizeSmall">Small</UiString>
  ),

  labelTotalContests: () => (
    <UiString uiStringKey="labelTotalContests">Total contests:</UiString>
  ),

  labelWriteInCandidateName: () => (
    <UiString uiStringKey="labelWriteInCandidateName">
      Write-In Candidate
    </UiString>
  ),

  // TODO(kofi): Could potentially leverage i18next post-processors to apply
  // letter case transforms at render-time to avoid maintaining separate, but
  // we'd need to find a reliable way of applying locale-specific capitalization
  // rules.
  labelWriteInTitleCase: () => (
    <UiString uiStringKey="labelWriteInTitleCase">Write-In</UiString>
  ),

  labelWriteInTitleCaseColon: () => (
    <UiString uiStringKey="labelWriteInTitleCaseColon">Write-In:</UiString>
  ),

  labelWriteInParenthesized: () => (
    <UiString uiStringKey="labelWriteInParenthesized">(write-in)</UiString>
  ),

  letterA: () => <UiString uiStringKey="letterA">A</UiString>,

  letterB: () => <UiString uiStringKey="letterB">B</UiString>,

  letterC: () => <UiString uiStringKey="letterC">C</UiString>,

  letterD: () => <UiString uiStringKey="letterD">D</UiString>,

  letterE: () => <UiString uiStringKey="letterE">E</UiString>,

  letterF: () => <UiString uiStringKey="letterF">F</UiString>,

  letterG: () => <UiString uiStringKey="letterG">G</UiString>,

  letterH: () => <UiString uiStringKey="letterH">H</UiString>,

  letterI: () => <UiString uiStringKey="letterI">I</UiString>,

  letterJ: () => <UiString uiStringKey="letterJ">J</UiString>,

  letterK: () => <UiString uiStringKey="letterK">K</UiString>,

  letterL: () => <UiString uiStringKey="letterL">L</UiString>,

  letterM: () => <UiString uiStringKey="letterM">M</UiString>,

  letterN: () => <UiString uiStringKey="letterN">N</UiString>,

  letterO: () => <UiString uiStringKey="letterO">O</UiString>,

  letterP: () => <UiString uiStringKey="letterP">P</UiString>,

  letterQ: () => <UiString uiStringKey="letterQ">Q</UiString>,

  letterR: () => <UiString uiStringKey="letterR">R</UiString>,

  letterS: () => <UiString uiStringKey="letterS">S</UiString>,

  letterT: () => <UiString uiStringKey="letterT">T</UiString>,

  letterU: () => <UiString uiStringKey="letterU">U</UiString>,

  letterV: () => <UiString uiStringKey="letterV">V</UiString>,

  letterW: () => <UiString uiStringKey="letterW">W</UiString>,

  letterX: () => <UiString uiStringKey="letterX">X</UiString>,

  letterY: () => <UiString uiStringKey="letterY">Y</UiString>,

  letterZ: () => <UiString uiStringKey="letterZ">Z</UiString>,

  noteAskPollWorkerForHelp: () => (
    <UiString uiStringKey="noteAskPollWorkerForHelp">
      Ask a poll worker if you need help.
    </UiString>
  ),

  noteBallotContestNoSelection: () => (
    <UiString uiStringKey="noteBallotContestNoSelection">No Selection</UiString>
  ),

  noteBmdBallotSheetLoaded: () => (
    <UiString uiStringKey="noteBmdBallotSheetLoaded">
      The ballot sheet has been loaded. You will have a chance to review your
      selections before reprinting your ballot.
    </UiString>
  ),

  noteBmdCastingBallot: () => (
    <UiString uiStringKey="noteBmdCastingBallot">Casting Ballot...</UiString>
  ),

  noteBmdClearingBallot: () => (
    <UiString uiStringKey="noteBmdClearingBallot">Clearing ballot</UiString>
  ),

  noteBmdContestCompleted: () => (
    <UiString uiStringKey="noteBmdContestCompleted">
      You've completed your selections on this contest. Press the right arrow
      button to advance to the next contest. You may continue navigating in this
      contest to change your selections.
    </UiString>
  ),

  noteBmdEitherNeitherNoSelection: () => (
    <UiString uiStringKey="noteBmdEitherNeitherNoSelection">
      First, vote "for either" or "against both". Then select your preferred
      measure.
    </UiString>
  ),

  noteBmdEitherNeitherSelectedEither: () => (
    <UiString uiStringKey="noteBmdEitherNeitherSelectedEither">
      You have selected "for either".{' '}
      <Font weight="bold">Now select your preferred measure.</Font>
    </UiString>
  ),

  noteBmdEitherNeitherSelectedEitherAndPreferred: () => (
    <UiString uiStringKey="noteBmdEitherNeitherSelectedEitherAndPreferred">
      You have selected "for either" and your preferred measure.
    </UiString>
  ),

  noteBmdEitherNeitherSelectedNeitherAndPreferred: () => (
    <UiString uiStringKey="noteBmdEitherNeitherSelectedNeitherAndPreferred">
      You have selected "against both" and your preferred measure.
    </UiString>
  ),

  noteBmdEitherNeitherSelectedNeither: () => (
    <UiString uiStringKey="noteBmdEitherNeitherSelectedNeither">
      You have selected "against both".{' '}
      <Font weight="bold">
        You may additionally select your preferred measure.
      </Font>
    </UiString>
  ),

  noteBmdEitherNeitherSelectedPreferred: () => (
    <UiString uiStringKey="noteBmdEitherNeitherSelectedPreferred">
      You have selected your preferred measure.{' '}
      <Font weight="bold">Now vote "for either" or "against both".</Font>
    </UiString>
  ),

  noteBmdHardwareReset: () => (
    <UiString uiStringKey="noteBmdHardwareReset">
      The hardware has been reset.
    </UiString>
  ),

  noteBmdHardwareResetting: () => (
    <UiString uiStringKey="noteBmdHardwareResetting">
      The hardware is resetting.
    </UiString>
  ),

  noteBmdInterpretationProblem: () => (
    <UiString uiStringKey="noteBmdInterpretationProblem">
      There was a problem interpreting your ballot.
    </UiString>
  ),

  noteBmdReloadSheetAfterPaperJam: () => (
    <UiString uiStringKey="noteBmdReloadSheetAfterPaperJam">
      Please ask a poll worker to load a new ballot sheet.
    </UiString>
  ),

  noteBmdSessionRestart: () => (
    <UiString uiStringKey="noteBmdSessionRestart">
      Your voting session will restart shortly.
    </UiString>
  ),

  noteBmdBallotBoxIsFull: () => (
    <UiString uiStringKey="noteBmdBallotBoxIsFull">
      A poll worker must empty the full ballot box.
    </UiString>
  ),

  noteBmdPrintedBallotReviewNextSteps: () => (
    <UiString uiStringKey="noteBmdPrintedBallotReviewNextSteps">
      You will have a chance to review and verify the votes on your printed
      ballot before it is cast.
    </UiString>
  ),

  noteBmdScanningReinsertedBallot: () => (
    <UiString uiStringKey="noteBmdScanningReinsertedBallot">
      Please wait while the votes on your ballot are scanned.
    </UiString>
  ),

  noteScannerBlankContestsCardPlural: () => (
    <UiString uiStringKey="noteScannerBlankContestsCardPlural">
      Did you mean to leave these contests blank?
    </UiString>
  ),

  noteScannerBlankContestsCardSingular: () => (
    <UiString uiStringKey="noteScannerBlankContestsCardSingular">
      Did you mean to leave this contest blank?
    </UiString>
  ),

  noteScannerDisconnected: () => (
    <UiString uiStringKey="noteScannerDisconnected">
      Scanner is disconnected.
    </UiString>
  ),

  notePrinterDisconnected: () => (
    <UiString uiStringKey="notePrinterDisconnected">
      Printer is disconnected.
    </UiString>
  ),

  notePrinterHardwareError: () => (
    <UiString uiStringKey="notePrinterHardwareError">
      The printer has experienced an unknown error.
    </UiString>
  ),

  noteScannerOvervoteContestsCardPlural: () => (
    <UiString uiStringKey="noteScannerOvervoteContestsCardPlural">
      Your votes in these contests will not be counted.
    </UiString>
  ),

  noteScannerOvervoteContestsCardSingular: () => (
    <UiString uiStringKey="noteScannerOvervoteContestsCardSingular">
      Your votes in this contest will not be counted.
    </UiString>
  ),

  noteScannerScanInProgress: () => (
    <UiString uiStringKey="noteScannerScanInProgress">
      Scanning the marks on your ballot.
    </UiString>
  ),

  noteScannerUndervoteContestsCardPlural: () => (
    <UiString uiStringKey="noteScannerUndervoteContestsCardPlural">
      All other votes in these contests will count.
    </UiString>
  ),

  noteScannerUndervoteContestsCardSingular: () => (
    <UiString uiStringKey="noteScannerUndervoteContestsCardSingular">
      All other votes in this contest will count.
    </UiString>
  ),

  noteThankYouForVoting: () => (
    <UiString uiStringKey="noteThankYouForVoting">
      Thank you for voting.
    </UiString>
  ),

  noteVoterSettingsAudioMuted: () => (
    <UiString uiStringKey="noteVoterSettingsAudioMuted">
      Audio is muted
    </UiString>
  ),

  noteVoterSettingsAudioNoHeadphones: () => (
    <UiString uiStringKey="noteVoterSettingsAudioNoHeadphones">
      No headphones detected.
    </UiString>
  ),

  noteVoterSettingsAudioUnmuted: () => (
    <UiString uiStringKey="noteVoterSettingsAudioUnmuted">Audio is on</UiString>
  ),

  promptBmdConfirmRemoveWriteIn: () => (
    <UiString uiStringKey="promptBmdConfirmRemoveWriteIn">
      Do you want to deselect and remove your write-in candidate?
    </UiString>
  ),

  promptBmdSoundDiagnosticScreen: () => (
    <UiString uiStringKey="promptBmdSoundDiagnosticScreen">
      Press the select button to confirm sound is working.
    </UiString>
  ),

  titleAudioOnlyModeEnabled: () => (
    <UiString uiStringKey="titleAudioOnlyModeEnabled">Audio-Only Mode</UiString>
  ),

  titleBallotBoxFull: () => (
    <UiString uiStringKey="titleBallotBoxFull">Ballot Box Full</UiString>
  ),

  titleBallotId: () => (
    <UiString uiStringKey="titleBallotId">Ballot ID</UiString>
  ),

  titleBallotStyle: () => (
    <UiString uiStringKey="titleBallotStyle">Ballot Style</UiString>
  ),

  titleBmdAskForHelpScreen: () => (
    <UiString uiStringKey="titleBmdAskForHelpScreen">
      Ask a poll worker for help
    </UiString>
  ),

  titleBmdBallotRemovedScreen: () => (
    <UiString uiStringKey="titleBmdBallotRemovedScreen">
      Ballot Removed
    </UiString>
  ),

  titleBmdCastBallotScreen: () => (
    <UiString uiStringKey="titleBmdCastBallotScreen">
      You’re Almost Done
    </UiString>
  ),

  titleBmdIdleScreen: () => (
    <UiString uiStringKey="titleBmdIdleScreen">Are you still voting?</UiString>
  ),

  titleBmdInvalidBallotNoBallotDetected: () => (
    <UiString uiStringKey="titleBmdInvalidBallotNoBallotDetected">
      No Ballot Detected
    </UiString>
  ),

  titleBmdInvalidBallotWrongElection: () => (
    <UiString uiStringKey="titleBmdInvalidBallotWrongElection">
      Wrong Election
    </UiString>
  ),

  titleBmdInvalidBallotWrongPrecinct: () => (
    <UiString uiStringKey="titleBmdInvalidBallotWrongPrecinct">
      Wrong Precinct
    </UiString>
  ),

  titleBmdInvalidBallotWrongTestMode: () => (
    <UiString uiStringKey="titleBmdInvalidBallotWrongTestMode">
      Wrong Ballot Mode
    </UiString>
  ),

  titleBmdJamClearedScreen: () => (
    <UiString uiStringKey="titleBmdJamClearedScreen">Jam Cleared</UiString>
  ),

  titleBmdJammedScreen: () => (
    <UiString uiStringKey="titleBmdJammedScreen">Paper is Jammed</UiString>
  ),

  titleBmdLoadingReinsertedBallotScreen: () => (
    <UiString uiStringKey="titleBmdLoadingReinsertedBallotScreen">
      Loading your ballot...
    </UiString>
  ),

  titleBmdPatCalibrationConfirmExitScreen: () => (
    <UiString uiStringKey="titleBmdPatCalibrationConfirmExitScreen">
      Device Inputs Identified
    </UiString>
  ),

  titleBmdPatCalibrationIdentificationPage: () => (
    <UiString uiStringKey="titleBmdPatCalibrationIdentificationPage">
      Personal Assistive Technology Device Identification
    </UiString>
  ),

  titleBmdPatCalibrationIdentifyMoveInput: () => (
    <UiString uiStringKey="titleBmdPatCalibrationIdentifyMoveInput">
      Identify the "Move" Input
    </UiString>
  ),

  titleBmdPatCalibrationIdentifySelectInput: () => (
    <UiString uiStringKey="titleBmdPatCalibrationIdentifySelectInput">
      Identify the "Select" Input
    </UiString>
  ),

  titleBmdPatCalibrationIntroStep: () => (
    <UiString uiStringKey="titleBmdPatCalibrationIntroStep">
      Test Your Device
    </UiString>
  ),

  titleBmdPrintScreen: () => (
    <UiString uiStringKey="titleBmdPrintScreen">
      Printing Your Official Ballot...
    </UiString>
  ),

  titleBmdReadyToReview: () => (
    <UiString uiStringKey="titleBmdReadyToReview">Ready to Review</UiString>
  ),

  titleBmdReviewScreen: () => (
    <UiString uiStringKey="titleBmdReviewScreen">Review Your Votes</UiString>
  ),

  titleLanguageSettingsScreen: () => (
    <UiString uiStringKey="titleLanguageSettingsScreen">
      Select Your Ballot Language
    </UiString>
  ),

  titleInternalConnectionProblem: () => (
    <UiString uiStringKey="titleInternalConnectionProblem">
      Internal Connection Problem
    </UiString>
  ),

  titlePrinterCoverIsOpen: () => (
    <UiString uiStringKey="titlePrinterCoverIsOpen">
      Printer Cover is Open
    </UiString>
  ),

  titleScannerCoverIsOpen: () => (
    <UiString uiStringKey="titleScannerCoverIsOpen">
      Scanner Cover is Open
    </UiString>
  ),

  titleVoterSettings: () => (
    <UiString uiStringKey="titleVoterSettings">Settings</UiString>
  ),

  titleVoterSettingsAudio: () => (
    <UiString uiStringKey="titleVoterSettingsAudio">Audio</UiString>
  ),

  titleVoterSettingsColor: () => (
    <UiString uiStringKey="titleVoterSettingsColor">Color</UiString>
  ),

  titleVoterSettingsSize: () => (
    <UiString uiStringKey="titleVoterSettingsSize">Text Size</UiString>
  ),

  noteBmdPatCalibrationIntroStep: () => (
    <UiString uiStringKey="noteBmdPatCalibrationIntroStep">
      Your two inputs can be used to <Font weight="bold">Move</Font> focus on
      the screen or <Font weight="bold">Select</Font> an item.
    </UiString>
  ),

  noteBmdPatCalibrationStep1: () => (
    <UiString uiStringKey="noteBmdPatCalibrationStep1">Step 1 of 3</UiString>
  ),

  noteBmdPatCalibrationStep2: () => (
    <UiString uiStringKey="noteBmdPatCalibrationStep2">Step 2 of 3</UiString>
  ),

  noteBmdPatCalibrationStep3: () => (
    <UiString uiStringKey="noteBmdPatCalibrationStep3">Step 3 of 3</UiString>
  ),

  titleModalConfirmYourVotes: () => (
    <UiString uiStringKey="titleModalConfirmYourVotes">
      Confirm Your Votes
    </UiString>
  ),

  titleNoPowerDetected: () => (
    <UiString uiStringKey="titleNoPowerDetected">No Power Detected</UiString>
  ),

  titleOfficialBallot: () => (
    <UiString uiStringKey="titleOfficialBallot">Official Ballot</UiString>
  ),

  titlePrecinct: () => (
    <UiString uiStringKey="titlePrecinct">Precinct</UiString>
  ),

  titleRemoveYourBallot: () => (
    <UiString uiStringKey="titleRemoveYourBallot">Remove Your Ballot</UiString>
  ),

  titleScannerCvrSyncRequired: () => (
    <UiString uiStringKey="titleScannerCvrSyncRequired">
      CVR Sync Required
    </UiString>
  ),

  titleScannerBallotNotCounted: () => (
    <UiString uiStringKey="titleScannerBallotNotCounted">
      Ballot Not Counted
    </UiString>
  ),

  titleScannerInsertBallotScreen: () => (
    <UiString uiStringKey="titleScannerInsertBallotScreen">
      Insert Your Ballot
    </UiString>
  ),

  titleScannerBallotWarningsScreen: () => (
    <UiString uiStringKey="titleScannerBallotWarningsScreen">
      Review Your Ballot
    </UiString>
  ),

  titleScannerNoVotesWarning: () => (
    <UiString uiStringKey="titleScannerNoVotesWarning">
      No votes marked:
    </UiString>
  ),

  titleScannerOutfeedBlocked: () => (
    <UiString uiStringKey="titleScannerOutfeedBlocked">
      Ballot Box Opening is Blocked
    </UiString>
  ),

  titleScannerOvervoteWarning: () => (
    <UiString uiStringKey="titleScannerOvervoteWarning">
      Too many votes marked:
    </UiString>
  ),

  titleScannerProcessingScreen: () => (
    <UiString uiStringKey="titleScannerProcessingScreen">Please wait…</UiString>
  ),

  titleBallotSuccessfullyCastPage: () => (
    <UiString uiStringKey="titleBallotSuccessfullyCastPage">
      Your ballot was cast!
    </UiString>
  ),

  titleScannerSuccessScreen: () => (
    <UiString uiStringKey="titleScannerSuccessScreen">
      Your ballot was counted!
    </UiString>
  ),

  titleScannerUndervoteWarning: () => (
    <UiString uiStringKey="titleScannerUndervoteWarning">
      You may add one or more votes:
    </UiString>
  ),

  titleScanningFailed: () => (
    <UiString uiStringKey="titleScanningFailed">Scanning Failed</UiString>
  ),

  titleUnofficialTestBallot: () => (
    <UiString uiStringKey="titleUnofficialTestBallot">
      Unofficial Test Ballot
    </UiString>
  ),

  unrecoverableError: () => (
    <UiString uiStringKey="unrecoverableError">Something went wrong</UiString>
  ),

  warningCvrsNeedSync: () => (
    <UiString uiStringKey="warningCvrsNeedSync">
      A poll worker must sync cast vote records (CVRs) to the USB drive.
    </UiString>
  ),

  warningBmdBallotRemoved: () => (
    <UiString uiStringKey="warningBmdBallotRemoved">
      Your official ballot has been removed from the printer.
    </UiString>
  ),

  warningBmdInactiveSession: () => (
    <UiString uiStringKey="warningBmdInactiveSession">
      This voting station has been inactive for more than 5 minutes.
    </UiString>
  ),

  warningBmdInactiveTimeRemaining: () => (
    <UiString uiStringKey="warningBmdInactiveTimeRemaining">
      To protect your privacy, this ballot will be cleared when the timer runs
      out.
    </UiString>
  ),

  warningBmdInvalidBallotNoBallotDetected: () => (
    <UiString uiStringKey="warningBmdInvalidBallotNoBallotDetected">
      There was no ballot information detected on the inserted sheet.
    </UiString>
  ),

  warningBmdInvalidBallotTestBallotInLiveMode: () => (
    <UiString uiStringKey="warningBmdInvalidBallotTestBallotInLiveMode">
      The inserted sheet is a <Font weight="bold">test</Font> ballot.
    </UiString>
  ),

  warningBmdInvalidBallotLiveBallotInTestMode: () => (
    <UiString uiStringKey="warningBmdInvalidBallotLiveBallotInTestMode">
      The inserted sheet is an <Font weight="bold">official</Font> ballot.
    </UiString>
  ),

  warningBmdInvalidBallotWrongElection: () => (
    <UiString uiStringKey="warningBmdInvalidBallotWrongElection">
      The inserted sheet is a ballot from a different election.
    </UiString>
  ),

  warningBmdInvalidBallotWrongPrecinct: () => (
    <UiString uiStringKey="warningBmdInvalidBallotWrongPrecinct">
      The inserted sheet is a ballot for a different precinct.
    </UiString>
  ),

  warningOvervoteCandidateContest: () => (
    <UiString uiStringKey="warningOvervoteCandidateContest">
      To vote for another candidate, you must first deselect a previously
      selected candidate.
    </UiString>
  ),

  warningOvervoteYesNoContest: () => (
    <UiString uiStringKey="warningOvervoteYesNoContest">
      To change your vote, first deselect your previous vote.
    </UiString>
  ),

  warningNoPower: () => (
    <UiString uiStringKey="warningNoPower">
      <Font weight="bold">No Power Detected.</Font> Please ask a poll worker to
      plug in the power cord.
    </UiString>
  ),

  warningNoVotesForContest: () => (
    <UiString uiStringKey="warningNoVotesForContest">
      You may still vote in this contest.
    </UiString>
  ),

  warningProblemScanningBallot: () => (
    <UiString uiStringKey="warningProblemScanningBallot">
      There was a problem scanning this ballot.
    </UiString>
  ),

  warningProblemScanningBallotScanAgain: () => (
    <UiString uiStringKey="warningProblemScanningBallotScanAgain">
      There was a problem scanning your ballot. Please scan it again.
    </UiString>
  ),

  warningScannerAnotherScanInProgress: () => (
    <UiString uiStringKey="warningScannerAnotherScanInProgress">
      Another ballot is being scanned.
    </UiString>
  ),

  warningScannerJammed: () => (
    <UiString uiStringKey="warningScannerJammed">
      The ballot is jammed in the scanner.
    </UiString>
  ),

  warningScannerBlankBallotSubmission: () => (
    <UiString uiStringKey="warningScannerBlankBallotSubmission">
      No votes will be counted from this ballot.
    </UiString>
  ),

  warningScannerOfficialBallotInTestMode: () => (
    <UiString uiStringKey="warningScannerOfficialBallotInTestMode">
      The scanner is in test ballot mode. Official ballots may not be scanned.
    </UiString>
  ),

  warningScannerMismatchedElection: () => (
    <UiString uiStringKey="warningScannerMismatchedElection">
      The ballot does not match the election this scanner is configured for.
    </UiString>
  ),

  warningScannerMismatchedPrecinct: () => (
    <UiString uiStringKey="warningScannerMismatchedPrecinct">
      The ballot does not match the precinct this scanner is configured for.
    </UiString>
  ),

  warningScannerMultipleSheetsDetected: () => (
    <UiString uiStringKey="warningScannerMultipleSheetsDetected">
      Multiple sheets detected.
    </UiString>
  ),

  warningScannerVerticalStreaksDetected: () => (
    <UiString uiStringKey="warningScannerVerticalStreaksDetected">
      The scanner needs to be cleaned.
    </UiString>
  ),

  warningScannerNoVotesFound: () => (
    <UiString uiStringKey="warningScannerNoVotesFound">
      No votes were found when scanning this ballot.
    </UiString>
  ),

  warningScannerTestBallotInOfficialMode: () => (
    <UiString uiStringKey="warningScannerTestBallotInOfficialMode">
      The scanner is in official ballot mode. Test ballots may not be scanned.
    </UiString>
  ),
} as const;

export type AppStringKey = keyof typeof appStrings;
