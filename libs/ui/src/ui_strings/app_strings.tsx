/* eslint-disable react/no-unescaped-entities */

import { ReactNode } from 'react';
import { Font } from '../typography';
import { BackendUiString } from './backend_strings';
import { UiString, UiStringProps } from './ui_string';

// TODO(kofi): Add lint rule to ensure object keys match uiStringKey props.

// After updating this file, run `pnpm build[:app-strings-catalog]` from `libs/ui`
// to generate libs/ui/src/ui_strings/app_strings_catalog/latest.json

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function generateAppStrings(
  Component: (props: UiStringProps) => ReactNode
) {
  return {
    audioFeedback10PercentVolume: () => (
      <Component uiStringKey="audioFeedback10PercentVolume">
        10% volume
      </Component>
    ),

    audioFeedback20PercentVolume: () => (
      <Component uiStringKey="audioFeedback20PercentVolume">
        20% volume
      </Component>
    ),

    audioFeedback30PercentVolume: () => (
      <Component uiStringKey="audioFeedback30PercentVolume">
        30% volume
      </Component>
    ),

    audioFeedback40PercentVolume: () => (
      <Component uiStringKey="audioFeedback40PercentVolume">
        40% volume
      </Component>
    ),

    audioFeedback50PercentVolume: () => (
      <Component uiStringKey="audioFeedback50PercentVolume">
        50% volume
      </Component>
    ),

    audioFeedback60PercentVolume: () => (
      <Component uiStringKey="audioFeedback60PercentVolume">
        60% volume
      </Component>
    ),

    audioFeedback70PercentVolume: () => (
      <Component uiStringKey="audioFeedback70PercentVolume">
        70% volume
      </Component>
    ),

    audioFeedback80PercentVolume: () => (
      <Component uiStringKey="audioFeedback80PercentVolume">
        80% volume
      </Component>
    ),

    audioFeedback90PercentVolume: () => (
      <Component uiStringKey="audioFeedback90PercentVolume">
        90% volume
      </Component>
    ),

    audioFeedbackMaximumVolume: () => (
      <Component uiStringKey="audioFeedbackMaximumVolume">
        Maximum volume
      </Component>
    ),

    audioFeedbackMinimumVolume: () => (
      <Component uiStringKey="audioFeedbackMinimumVolume">
        Minimum volume
      </Component>
    ),

    bmdPatDeviceInputNameMove: () => (
      <Component uiStringKey="bmdPatDeviceInputNameMove">"Move"</Component>
    ),

    bmdPatDeviceInputNameSelect: () => (
      <Component uiStringKey="bmdPatDeviceInputNameSelect">"Select"</Component>
    ),

    buttonAccept: () => (
      <Component uiStringKey="buttonAccept">Accept</Component>
    ),

    buttonAddWriteIn: () => (
      <Component uiStringKey="buttonAddWriteIn">
        add write-in candidate
      </Component>
    ),

    buttonAudioMute: () => (
      <Component uiStringKey="buttonAudioMute">Mute Audio</Component>
    ),

    buttonAudioUnmute: () => (
      <Component uiStringKey="buttonAudioUnmute">Unmute Audio</Component>
    ),

    buttonBack: () => <Component uiStringKey="buttonBack">Back</Component>,

    buttonBallotIsCorrect: () => (
      <Component uiStringKey="buttonBallotIsCorrect">
        My Ballot is Correct
      </Component>
    ),

    buttonBallotIsIncorrect: () => (
      <Component uiStringKey="buttonBallotIsIncorrect">
        My Ballot is Incorrect
      </Component>
    ),

    buttonBmdReviewCardAction: () => (
      <Component uiStringKey="buttonBmdReviewCardAction">
        Press the select button to change your votes for this contest.
      </Component>
    ),

    buttonBmdSkipPatCalibration: () => (
      <Component uiStringKey="buttonBmdSkipPatCalibration">
        Skip Identification
      </Component>
    ),

    buttonCancel: () => (
      <Component uiStringKey="buttonCancel">Cancel</Component>
    ),

    buttonCastBallotAsIs: () => (
      <Component uiStringKey="buttonCastBallotAsIs">
        Cast Ballot As Is
      </Component>
    ),

    buttonChange: () => (
      <Component uiStringKey="buttonChange">Change</Component>
    ),

    buttonClose: () => <Component uiStringKey="buttonClose">Close</Component>,

    buttonContinueVoting: () => (
      <Component uiStringKey="buttonContinueVoting">
        Continue with Voting
      </Component>
    ),

    buttonDone: () => <Component uiStringKey="buttonDone">Done</Component>,

    buttonEnableAudioOnlyMode: () => (
      <Component uiStringKey="buttonEnableAudioOnlyMode">
        Enable Audio-Only Mode
      </Component>
    ),

    buttonExitAudioOnlyMode: () => (
      <Component uiStringKey="buttonExitAudioOnlyMode">
        Exit Audio-Only Mode
      </Component>
    ),

    buttonMore: () => <Component uiStringKey="buttonMore">More</Component>,

    buttonNext: () => <Component uiStringKey="buttonNext">Next</Component>,

    buttonNo: () => <Component uiStringKey="buttonNo">No</Component>,

    buttonStillVoting: () => (
      <Component uiStringKey="buttonStillVoting">
        Yes, I’m still voting.
      </Component>
    ),

    buttonOkay: () => <Component uiStringKey="buttonOkay">Okay</Component>,

    buttonReset: () => <Component uiStringKey="buttonReset">Reset</Component>,

    buttonPrintBallot: () => (
      <Component uiStringKey="buttonPrintBallot">Print My Ballot</Component>
    ),

    buttonReturnBallot: () => (
      <Component uiStringKey="buttonReturnBallot">Return Ballot</Component>
    ),

    buttonReturnToBallotReview: () => (
      <Component uiStringKey="buttonReturnToBallotReview">
        Return to Ballot Review
      </Component>
    ),

    buttonReview: () => (
      <Component uiStringKey="buttonReview">Review</Component>
    ),

    buttonStartVoting: () => (
      <Component uiStringKey="buttonStartVoting">Start Voting</Component>
    ),

    buttonViewContests: () => (
      <Component uiStringKey="buttonViewContests">View contests</Component>
    ),

    buttonVoterSettings: () => (
      <Component uiStringKey="buttonVoterSettings">Settings</Component>
    ),

    buttonYes: () => <Component uiStringKey="buttonYes">Yes</Component>,

    buttonYesCastBallotAsIs: () => (
      <Component uiStringKey="buttonYesCastBallotAsIs">
        Yes, Cast Ballot As Is
      </Component>
    ),

    helpBmdControllerButtonFocusNext: () => (
      <Component uiStringKey="helpBmdControllerButtonFocusNext">
        This is the Down button, for focusing on the next item in a list of
        options on a page. You can use the Up and Down buttons to move through
        candidates in a contest.
      </Component>
    ),

    helpBmdControllerButtonFocusPrevious: () => (
      <Component uiStringKey="helpBmdControllerButtonFocusPrevious">
        This is the Up button, for focusing on the previous item in a list of
        options on a page. You can use the Up and Down buttons to move through
        candidates in a contest.
      </Component>
    ),

    helpBmdControllerButtonPageNext: () => (
      <Component uiStringKey="helpBmdControllerButtonPageNext">
        This is the Right button, for moving to the next page or contest. You
        can use the Left and Right buttons to move through all the contests on
        your ballot.
      </Component>
    ),

    helpBmdControllerButtonPagePrevious: () => (
      <Component uiStringKey="helpBmdControllerButtonPagePrevious">
        This is the Left button, for returning to the previous page or contest.
        You can use the Left and Right buttons to move through all the contests
        on your ballot.
      </Component>
    ),

    helpBmdControllerButtonPlaybackRateDown: () => (
      <Component uiStringKey="helpBmdControllerButtonPlaybackRateDown">
        This button reduces the playback rate of the text-to-speech audio.
      </Component>
    ),

    helpBmdControllerButtonPlaybackRateUp: () => (
      <Component uiStringKey="helpBmdControllerButtonPlaybackRateUp">
        This button increases the playback rate of the text-to-speech audio.
      </Component>
    ),

    helpBmdControllerButtonSelect: () => (
      <Component uiStringKey="helpBmdControllerButtonSelect">
        This is the Select button. Use this button to mark your vote for a
        candidate or a yes or no option. Pressing the Select button again will
        remove your previous vote.
      </Component>
    ),

    helpBmdControllerButtonToggleHelp: () => (
      <Component uiStringKey="helpBmdControllerButtonToggleHelp">
        This is the Help button. Press this button again to return to filling
        out your ballot.
      </Component>
    ),

    helpBmdControllerButtonTogglePause: () => (
      <Component uiStringKey="helpBmdControllerButtonTogglePause">
        This is the Pause button. Use this button to pause the text-to-speech
        audio. Pressing the Pause button again will resume the text-to-speech
        audio.
      </Component>
    ),

    helpBmdControllerButtonVolumeDown: () => (
      <Component uiStringKey="helpBmdControllerButtonVolumeDown">
        This button reduces the volume of the text-to-speech audio.
      </Component>
    ),

    helpBmdControllerButtonVolumeUp: () => (
      <Component uiStringKey="helpBmdControllerButtonVolumeUp">
        This button increases the volume of the text-to-speech audio.
      </Component>
    ),

    instructionsAskForHelp: () => (
      <Component uiStringKey="instructionsAskForHelp">
        Please ask a poll worker for help.
      </Component>
    ),

    instructionsAskPollWorkerToPlugInPower: () => (
      <Component uiStringKey="instructionsAskPollWorkerToPlugInPower">
        Please ask a poll worker to plug in the power cord.
      </Component>
    ),

    instructionsAudioMuteButton: () => (
      <Component uiStringKey="instructionsAudioMuteButton">
        Press the select button to mute all audio.
      </Component>
    ),

    instructionsBmdBallotNavigationMark: () => (
      <Component uiStringKey="instructionsBmdBallotNavigationMark">
        When voting with the text-to-speech audio, use the accessible controller
        to navigate your ballot. To navigate through the contests, use the left
        and right buttons. To navigate through contest choices, use the up and
        down buttons. To select or unselect a contest choice as your vote, use
        the select button. Press the right button now to advance to the first
        contest.
      </Component>
    ),

    instructionsBmdBallotNavigationMarkScan: () => (
      <Component uiStringKey="instructionsBmdBallotNavigationMarkScan">
        When voting with the text-to-speech audio, use the accessible controller
        to navigate your ballot. There are four navigation arrow buttons located
        near the center of the controller. To navigate through the contests, use
        the left and right arrows. To navigate through contest choices, use the
        up and down arrows. To select or unselect a contest choice as your vote,
        use the circle Select button to the right of the navigation buttons. You
        can find two volume controls at the top right corner of the controller.
        The minus button reduces the volume of your audio and the plus button
        increases the volume. To change the speech rate of your audio, use the
        two buttons at the bottom right corner of the controller. The down arrow
        button reduces the speech rate and the up arrow button increases it. To
        pause or unpause the audio at any time, use the pause button at the
        bottom left corner of the controller. If you need more information on
        how to use the controller, press the question mark button at the top
        left corner at any time. To repeat any content, navigate back to
        previous content using the up or left arrows. Press the right button now
        to advance to the first contest.
      </Component>
    ),

    instructionsBmdCastBallotPreamble: () => (
      <Component uiStringKey="instructionsBmdCastBallotPreamble">
        Your official ballot is printing. Complete the following steps to finish
        voting:
      </Component>
    ),

    instructionsBmdCastBallotPreamblePostPrint: () => (
      <Component uiStringKey="instructionsBmdCastBallotPreamblePostPrint">
        Your official ballot has been removed from the printer. Complete the
        following steps to finish voting:
      </Component>
    ),

    instructionsBmdCastBallotStep1: () => (
      <Component uiStringKey="instructionsBmdCastBallotStep1">
        1. Verify your official ballot.
      </Component>
    ),

    instructionsBmdCastBallotStep2: () => (
      <Component uiStringKey="instructionsBmdCastBallotStep2">
        2. Scan your official ballot.
      </Component>
    ),

    instructionsBmdContestNavigation: () => (
      <Component uiStringKey="instructionsBmdContestNavigation">
        To navigate through the contest choices, use the down button. To move to
        the next contest, use the right button.
      </Component>
    ),

    instructionsBmdControllerSandboxMarkScan: () => (
      <Component uiStringKey="instructionsBmdControllerSandboxMarkScan">
        Press any button on the controller to learn what it is and how to use
        it. When you're done, press the question mark shaped “Help” button at
        the top left corner of the controller again to return to your ballot.
      </Component>
    ),

    instructionsBmdInvalidatedBallot: () => (
      <Component uiStringKey="instructionsBmdInvalidatedBallot">
        You have indicated your ballot needs changes. Please alert a poll worker
        to invalidate the incorrect ballot sheet.
      </Component>
    ),

    instructionsBmdLoadPaper: () => (
      <Component uiStringKey="instructionsBmdLoadPaper">
        Please feed one sheet of paper into the front input tray. The printer
        will automatically grab the paper when positioned correctly.
      </Component>
    ),

    instructionsBmdPaperJam: () => (
      <Component uiStringKey="instructionsBmdPaperJam">
        Please alert a poll worker to clear the jam, opening the printer cover
        or ballot box if necessary.
      </Component>
    ),

    instructionsBmdPatCalibrationConfirmExitScreen: () => (
      <Component uiStringKey="instructionsBmdPatCalibrationConfirmExitScreen">
        You may continue with voting or go back to the previous screen.
      </Component>
    ),

    instructionsBmdPatCalibrationIntroStep: () => (
      <Component uiStringKey="instructionsBmdPatCalibrationIntroStep">
        Trigger any input to continue.
      </Component>
    ),

    instructionsBmdPatCalibrationTriggerInputAgain: () => (
      <Component uiStringKey="instructionsBmdPatCalibrationTriggerInputAgain">
        Trigger the input again to continue.
      </Component>
    ),

    instructionsBmdPatCalibrationTryInput: () => (
      <Component uiStringKey="instructionsBmdPatCalibrationTryInput">
        Try an input to continue.
      </Component>
    ),

    instructionsBmdPatCalibrationTryOtherInput: () => (
      <Component uiStringKey="instructionsBmdPatCalibrationTryOtherInput">
        Try the other input.
      </Component>
    ),

    instructionsBmdReviewPageNavigation: () => (
      <Component uiStringKey="instructionsBmdReviewPageNavigation">
        To review your votes, advance through the ballot contests using the up
        and down buttons.
      </Component>
    ),

    instructionsBmdReviewPageChangingVotes: () => (
      <Component uiStringKey="instructionsBmdReviewPageChangingVotes">
        To change your vote in any contest, use the select button to navigate to
        that contest. When you are finished making your ballot selections and
        ready to print your ballot, use the right button to print your ballot.
      </Component>
    ),

    instructionsBmdScanReviewConfirmation: () => (
      <Component uiStringKey="instructionsBmdScanReviewConfirmation">
        If your selections are correct, press the Right button to confirm your
        choices and cast your ballot. If there is an error, press the Left
        button to mark this ballot as incorrect and alert a poll worker.
      </Component>
    ),

    instructionsBmdSelectToContinue: () => (
      <Component uiStringKey="instructionsBmdSelectToContinue">
        Press the select button to continue.
      </Component>
    ),

    instructionsBmdWriteInFormNavigation: () => (
      <Component uiStringKey="instructionsBmdWriteInFormNavigation">
        Use the up and down buttons to navigate between the letters of a
        standard keyboard. Use the select button to select the current letter.
      </Component>
    ),

    instructionsLanguageSettingsScreen: () => (
      <Component uiStringKey="instructionsLanguageSettingsScreen">
        Use the up and down buttons to navigate through the available ballot
        languages. To select a language, use the select button. When you're
        done, use the right button to continue voting.
      </Component>
    ),

    instructionsScannerAskForRestart: () => (
      <Component uiStringKey="instructionsScannerAskForRestart">
        Ask a poll worker to restart the scanner.
      </Component>
    ),

    instructionsScannerInsertBallotScreen: () => (
      <Component uiStringKey="instructionsScannerInsertBallotScreen">
        Scan one ballot sheet at a time.
      </Component>
    ),

    instructionsScannerRemoveBallotToContinue: () => (
      <Component uiStringKey="instructionsScannerRemoveBallotToContinue">
        Remove ballot to continue.
      </Component>
    ),

    instructionsScannerRemoveDoubleSheet: () => (
      <Component uiStringKey="instructionsScannerRemoveDoubleSheet">
        Remove your ballot and insert one sheet at a time.
      </Component>
    ),

    labelAllPrecinctsSelection: () => (
      <Component uiStringKey="labelAllPrecinctsSelection">
        All Precincts
      </Component>
    ),

    labelNumBallotsScanned: () => (
      <Component uiStringKey="labelNumBallotsScanned">
        Ballots Scanned
      </Component>
    ),

    labelBallotStyle: () => (
      <Component uiStringKey="labelBallotStyle">Ballot style:</Component>
    ),

    labelBmdPatCalibrationInputIdentified: () => (
      <Component uiStringKey="labelBmdPatCalibrationInputIdentified">
        Input Identified:
      </Component>
    ),

    labelBmdPatCalibrationInputTriggered: () => (
      <Component uiStringKey="labelBmdPatCalibrationInputTriggered">
        Input Triggered:
      </Component>
    ),

    labelBmdSecondsRemaining: () => (
      <Component uiStringKey="labelBmdSecondsRemaining">
        Number of seconds remaining:
      </Component>
    ),

    labelBmdWriteInForm: () => (
      <Component uiStringKey="labelBmdWriteInForm">
        Enter the name of a person who is <Font weight="bold">not</Font> on the
        ballot:
      </Component>
    ),

    labelCharactersRemaining: () => (
      <Component uiStringKey="labelCharactersRemaining">
        Characters remaining:
      </Component>
    ),

    labelContestsRemaining: () => (
      <Component uiStringKey="labelContestsRemaining">
        Contests remaining:
      </Component>
    ),

    labelContestNumber: () => (
      <Component uiStringKey="labelContestNumber">Contest number:</Component>
    ),

    labelContestsWithNoVotes: () => (
      <Component uiStringKey="labelContestsWithNoVotes">
        Contests with no votes marked:
      </Component>
    ),

    labelContestsWithTooManyVotes: () => (
      <Component uiStringKey="labelContestsWithTooManyVotes">
        Contests with too many votes marked:
      </Component>
    ),

    labelContestsWithVotesRemaining: () => (
      <Component uiStringKey="labelContestsWithVotesRemaining">
        Contests with one or more votes remaining:
      </Component>
    ),

    labelDeselected: () => (
      <Component uiStringKey="labelDeselected">Deselected:</Component>
    ),

    labelDeselectedOption: () => (
      <Component uiStringKey="labelDeselectedOption">
        Deselected option:
      </Component>
    ),

    labelEitherNeitherContestEitherNeitherSection: () => (
      <Component uiStringKey="labelEitherNeitherContestEitherNeitherSection">
        VOTE FOR APPROVAL OF EITHER, OR AGAINST BOTH
      </Component>
    ),

    labelEitherNeitherContestPickOneSection: () => (
      <Component uiStringKey="labelEitherNeitherContestPickOneSection">
        AND VOTE FOR ONE
      </Component>
    ),

    labelKeyboardComma: () => (
      <Component uiStringKey="labelKeyboardComma">,</Component>
    ),

    labelKeyboardDelete: () => (
      <Component uiStringKey="labelKeyboardDelete">delete</Component>
    ),

    labelKeyboardDoubleQuote: () => (
      <Component uiStringKey="labelKeyboardDoubleQuote">"</Component>
    ),

    labelKeyboardHyphen: () => (
      <Component uiStringKey="labelKeyboardHyphen">-</Component>
    ),

    labelKeyboardPeriod: () => (
      <Component uiStringKey="labelKeyboardPeriod">.</Component>
    ),

    labelKeyboardSingleQuote: () => (
      <Component uiStringKey="labelKeyboardSingleQuote">'</Component>
    ),

    labelKeyboardSpaceBar: () => (
      <Component uiStringKey="labelKeyboardSpaceBar">space</Component>
    ),

    labelNumBallotContests: () => (
      <Component uiStringKey="labelNumBallotContests">
        Number of contests on your ballot:
      </Component>
    ),

    labelNumVotesRemaining: () => (
      <Component uiStringKey="labelNumVotesRemaining">
        Votes remaining in this contest:
      </Component>
    ),

    labelNumVotesUnused: () => (
      <Component uiStringKey="labelNumVotesUnused">
        Number of unused votes:
      </Component>
    ),

    labelSelected: () => (
      <Component uiStringKey="labelSelected">Selected:</Component>
    ),

    labelSelectedOption: () => (
      <Component uiStringKey="labelSelectedOption">Selected option:</Component>
    ),

    labelThemesContrastHighDark: () => (
      <Component uiStringKey="labelThemesContrastHighDark">
        White text, black background
      </Component>
    ),

    labelThemesContrastHighLight: () => (
      <Component uiStringKey="labelThemesContrastHighLight">
        Black text, white background
      </Component>
    ),

    labelThemesContrastLow: () => (
      <Component uiStringKey="labelThemesContrastLow">
        Gray text, dark background
      </Component>
    ),

    labelThemesContrastMedium: () => (
      <Component uiStringKey="labelThemesContrastMedium">
        Dark text, light background
      </Component>
    ),

    labelThemesSizeExtraLarge: () => (
      <Component uiStringKey="labelThemesSizeExtraLarge">Extra-Large</Component>
    ),

    labelThemesSizeLarge: () => (
      <Component uiStringKey="labelThemesSizeLarge">Large</Component>
    ),

    labelThemesSizeMedium: () => (
      <Component uiStringKey="labelThemesSizeMedium">Medium</Component>
    ),

    labelThemesSizeSmall: () => (
      <Component uiStringKey="labelThemesSizeSmall">Small</Component>
    ),

    labelTotalContests: () => (
      <Component uiStringKey="labelTotalContests">Total contests:</Component>
    ),

    labelWriteInCandidateName: () => (
      <Component uiStringKey="labelWriteInCandidateName">
        Write-In Candidate
      </Component>
    ),

    // TODO(kofi): Could potentially leverage i18next post-processors to apply
    // letter case transforms at render-time to avoid maintaining separate, but
    // we'd need to find a reliable way of applying locale-specific capitalization
    // rules.
    labelWriteInTitleCase: () => (
      <Component uiStringKey="labelWriteInTitleCase">Write-In</Component>
    ),

    labelWriteInTitleCaseColon: () => (
      <Component uiStringKey="labelWriteInTitleCaseColon">Write-In:</Component>
    ),

    labelWriteInParenthesized: () => (
      <Component uiStringKey="labelWriteInParenthesized">(write-in)</Component>
    ),

    letterA: () => <Component uiStringKey="letterA">A</Component>,

    letterB: () => <Component uiStringKey="letterB">B</Component>,

    letterC: () => <Component uiStringKey="letterC">C</Component>,

    letterD: () => <Component uiStringKey="letterD">D</Component>,

    letterE: () => <Component uiStringKey="letterE">E</Component>,

    letterF: () => <Component uiStringKey="letterF">F</Component>,

    letterG: () => <Component uiStringKey="letterG">G</Component>,

    letterH: () => <Component uiStringKey="letterH">H</Component>,

    letterI: () => <Component uiStringKey="letterI">I</Component>,

    letterJ: () => <Component uiStringKey="letterJ">J</Component>,

    letterK: () => <Component uiStringKey="letterK">K</Component>,

    letterL: () => <Component uiStringKey="letterL">L</Component>,

    letterM: () => <Component uiStringKey="letterM">M</Component>,

    letterN: () => <Component uiStringKey="letterN">N</Component>,

    letterO: () => <Component uiStringKey="letterO">O</Component>,

    letterP: () => <Component uiStringKey="letterP">P</Component>,

    letterQ: () => <Component uiStringKey="letterQ">Q</Component>,

    letterR: () => <Component uiStringKey="letterR">R</Component>,

    letterS: () => <Component uiStringKey="letterS">S</Component>,

    letterT: () => <Component uiStringKey="letterT">T</Component>,

    letterU: () => <Component uiStringKey="letterU">U</Component>,

    letterV: () => <Component uiStringKey="letterV">V</Component>,

    letterW: () => <Component uiStringKey="letterW">W</Component>,

    letterX: () => <Component uiStringKey="letterX">X</Component>,

    letterY: () => <Component uiStringKey="letterY">Y</Component>,

    letterZ: () => <Component uiStringKey="letterZ">Z</Component>,

    noteAskPollWorkerForHelp: () => (
      <Component uiStringKey="noteAskPollWorkerForHelp">
        Ask a poll worker if you need help.
      </Component>
    ),

    noteBallotContestNoSelection: () => (
      <Component uiStringKey="noteBallotContestNoSelection">
        no selection
      </Component>
    ),

    noteBmdBallotSheetLoaded: () => (
      <Component uiStringKey="noteBmdBallotSheetLoaded">
        The ballot sheet has been loaded. You will have a chance to review your
        selections before reprinting your ballot.
      </Component>
    ),

    noteBmdCastingBallot: () => (
      <Component uiStringKey="noteBmdCastingBallot">
        Casting Ballot...
      </Component>
    ),

    noteBmdClearingBallot: () => (
      <Component uiStringKey="noteBmdClearingBallot">Clearing ballot</Component>
    ),

    noteBmdEitherNeitherNoSelection: () => (
      <Component uiStringKey="noteBmdEitherNeitherNoSelection">
        First, vote "for either" or "against both". Then select your preferred
        measure.
      </Component>
    ),

    noteBmdEitherNeitherSelectedEither: () => (
      <Component uiStringKey="noteBmdEitherNeitherSelectedEither">
        You have selected "for either".{' '}
        <Font weight="bold">Now select your preferred measure.</Font>
      </Component>
    ),

    noteBmdEitherNeitherSelectedEitherAndPreferred: () => (
      <Component uiStringKey="noteBmdEitherNeitherSelectedEitherAndPreferred">
        You have selected "for either" and your preferred measure.
      </Component>
    ),

    noteBmdEitherNeitherSelectedNeitherAndPreferred: () => (
      <Component uiStringKey="noteBmdEitherNeitherSelectedNeitherAndPreferred">
        You have selected "against both" and your preferred measure.
      </Component>
    ),

    noteBmdEitherNeitherSelectedNeither: () => (
      <Component uiStringKey="noteBmdEitherNeitherSelectedNeither">
        You have selected "against both".{' '}
        <Font weight="bold">
          You may additionally select your preferred measure.
        </Font>
      </Component>
    ),

    noteBmdEitherNeitherSelectedPreferred: () => (
      <Component uiStringKey="noteBmdEitherNeitherSelectedPreferred">
        You have selected your preferred measure.{' '}
        <Font weight="bold">Now vote "for either" or "against both".</Font>
      </Component>
    ),

    noteBmdHardwareReset: () => (
      <Component uiStringKey="noteBmdHardwareReset">
        The hardware has been reset.
      </Component>
    ),

    noteBmdHardwareResetting: () => (
      <Component uiStringKey="noteBmdHardwareResetting">
        The hardware is resetting.
      </Component>
    ),

    noteBmdInterpretationProblem: () => (
      <Component uiStringKey="noteBmdInterpretationProblem">
        There was a problem interpreting your ballot.
      </Component>
    ),

    noteBmdSessionRestart: () => (
      <Component uiStringKey="noteBmdSessionRestart">
        Your voting session will restart shortly.
      </Component>
    ),

    noteBmdBallotBoxIsFull: () => (
      <Component uiStringKey="noteBmdBallotBoxIsFull">
        A poll worker must empty the full ballot box.
      </Component>
    ),

    noteScannerReplaceFullBallotBag: () => (
      <Component uiStringKey="noteScannerReplaceFullBallotBag">
        A poll worker must replace the full ballot bag with a new empty ballot
        bag.
      </Component>
    ),

    noteScannerBlankContestsCardPlural: () => (
      <Component uiStringKey="noteScannerBlankContestsCardPlural">
        Did you mean to leave these contests blank?
      </Component>
    ),

    noteScannerBlankContestsCardSingular: () => (
      <Component uiStringKey="noteScannerBlankContestsCardSingular">
        Did you mean to leave this contest blank?
      </Component>
    ),

    noteScannerOvervoteContestsCardPlural: () => (
      <Component uiStringKey="noteScannerOvervoteContestsCardPlural">
        Your votes in these contests will not be counted.
      </Component>
    ),

    noteScannerOvervoteContestsCardSingular: () => (
      <Component uiStringKey="noteScannerOvervoteContestsCardSingular">
        Your votes in this contest will not be counted.
      </Component>
    ),

    noteScannerScanInProgress: () => (
      <Component uiStringKey="noteScannerScanInProgress">
        Scanning the marks on your ballot.
      </Component>
    ),

    noteScannerUndervoteContestsCardPlural: () => (
      <Component uiStringKey="noteScannerUndervoteContestsCardPlural">
        All other votes in these contests will count, even if you leave some
        blank.
      </Component>
    ),

    noteScannerUndervoteContestsCardSingular: () => (
      <Component uiStringKey="noteScannerUndervoteContestsCardSingular">
        All other votes in this contest will count, even if you leave some
        blank.
      </Component>
    ),

    noteThankYouForVoting: () => (
      <Component uiStringKey="noteThankYouForVoting">
        Thank you for voting.
      </Component>
    ),

    noteVoterSettingsAudioMuted: () => (
      <Component uiStringKey="noteVoterSettingsAudioMuted">
        Audio is muted
      </Component>
    ),

    noteVoterSettingsAudioUnmuted: () => (
      <Component uiStringKey="noteVoterSettingsAudioUnmuted">
        Audio is on
      </Component>
    ),

    notePollWorkerAuthEndedBeforePaperLoadComplete: () => (
      <Component uiStringKey="notePollWorkerAuthEndedBeforePaperLoadComplete">
        The poll worker card was removed before paper loading completed. Please
        try again.
      </Component>
    ),

    promptBmdConfirmRemoveWriteIn: () => (
      <Component uiStringKey="promptBmdConfirmRemoveWriteIn">
        Do you want to deselect and remove your write-in candidate?
      </Component>
    ),

    promptBmdSoundDiagnosticScreen: () => (
      <Component uiStringKey="promptBmdSoundDiagnosticScreen">
        Press the select button to confirm sound is working.
      </Component>
    ),

    titleAudioOnlyModeEnabled: () => (
      <Component uiStringKey="titleAudioOnlyModeEnabled">
        Audio-Only Mode is Enabled
      </Component>
    ),

    titleBallotBoxFull: () => (
      <Component uiStringKey="titleBallotBoxFull">Ballot Box Full</Component>
    ),

    titleBallotBagFull: () => (
      <Component uiStringKey="titleBallotBagFull">Ballot Bag Full</Component>
    ),

    titleBallotId: () => (
      <Component uiStringKey="titleBallotId">Ballot ID</Component>
    ),

    titleBallotStyle: () => (
      <Component uiStringKey="titleBallotStyle">Ballot Style</Component>
    ),

    titleBmdAskForHelpScreen: () => (
      <Component uiStringKey="titleBmdAskForHelpScreen">
        Ask a Poll Worker for Help
      </Component>
    ),

    titleBmdCastBallotScreen: () => (
      <Component uiStringKey="titleBmdCastBallotScreen">
        You’re Almost Done
      </Component>
    ),

    titleBmdIdleScreen: () => (
      <Component uiStringKey="titleBmdIdleScreen">
        Are you still voting?
      </Component>
    ),

    titleBmdJamClearedScreen: () => (
      <Component uiStringKey="titleBmdJamClearedScreen">Jam Cleared</Component>
    ),

    titleBmdJammedScreen: () => (
      <Component uiStringKey="titleBmdJammedScreen">Paper is Jammed</Component>
    ),

    titleBmdLoadPaperScreen: () => (
      <Component uiStringKey="titleBmdLoadPaperScreen">
        Load Blank Ballot Sheet
      </Component>
    ),

    titleBmdPatCalibrationConfirmExitScreen: () => (
      <Component uiStringKey="titleBmdPatCalibrationConfirmExitScreen">
        Device Inputs Identified
      </Component>
    ),

    titleBmdPatCalibrationIdentificationPage: () => (
      <Component uiStringKey="titleBmdPatCalibrationIdentificationPage">
        Personal Assistive Technology Device Identification
      </Component>
    ),

    titleBmdPatCalibrationIdentifyMoveInput: () => (
      <Component uiStringKey="titleBmdPatCalibrationIdentifyMoveInput">
        Identify the "Move" Input
      </Component>
    ),

    titleBmdPatCalibrationIdentifySelectInput: () => (
      <Component uiStringKey="titleBmdPatCalibrationIdentifySelectInput">
        Identify the "Select" Input
      </Component>
    ),

    titleBmdPatCalibrationIntroStep: () => (
      <Component uiStringKey="titleBmdPatCalibrationIntroStep">
        Test Your Device
      </Component>
    ),

    titleBmdPrintScreen: () => (
      <Component uiStringKey="titleBmdPrintScreen">
        Printing Your Official Ballot...
      </Component>
    ),

    titleBmdReadyToReview: () => (
      <Component uiStringKey="titleBmdReadyToReview">Ready to Review</Component>
    ),

    titleBmdReviewScreen: () => (
      <Component uiStringKey="titleBmdReviewScreen">
        Review Your Votes
      </Component>
    ),

    titleLanguageSettingsScreen: () => (
      <Component uiStringKey="titleLanguageSettingsScreen">
        Select Your Ballot Language
      </Component>
    ),

    titleInternalConnectionProblem: () => (
      <Component uiStringKey="titleInternalConnectionProblem">
        Internal Connection Problem
      </Component>
    ),

    titleVoterSettings: () => (
      <Component uiStringKey="titleVoterSettings">Settings:</Component>
    ),

    titleVoterSettingsAudio: () => (
      <Component uiStringKey="titleVoterSettingsAudio">Audio</Component>
    ),

    titleVoterSettingsColor: () => (
      <Component uiStringKey="titleVoterSettingsColor">Color</Component>
    ),

    titleVoterSettingsSize: () => (
      <Component uiStringKey="titleVoterSettingsSize">Text Size</Component>
    ),

    noteBmdPatCalibrationIntroStep: () => (
      <Component uiStringKey="noteBmdPatCalibrationIntroStep">
        Your device's two inputs can be used to <Font weight="bold">Move</Font>{' '}
        focus between two items on the screen and{' '}
        <Font weight="bold">Select</Font> an item.
      </Component>
    ),

    noteBmdPatCalibrationStep1: () => (
      <Component uiStringKey="noteBmdPatCalibrationStep1">
        Step 1 of 3
      </Component>
    ),

    noteBmdPatCalibrationStep2: () => (
      <Component uiStringKey="noteBmdPatCalibrationStep2">
        Step 2 of 3
      </Component>
    ),

    noteBmdPatCalibrationStep3: () => (
      <Component uiStringKey="noteBmdPatCalibrationStep3">
        Step 3 of 3
      </Component>
    ),

    titleModalAreYouSure: () => (
      <Component uiStringKey="titleModalAreYouSure">Are you sure?</Component>
    ),

    titleNoPowerDetected: () => (
      <Component uiStringKey="titleNoPowerDetected">
        No Power Detected
      </Component>
    ),

    titleOfficialBallot: () => (
      <Component uiStringKey="titleOfficialBallot">Official Ballot</Component>
    ),

    titlePrecinct: () => (
      <Component uiStringKey="titlePrecinct">Precinct</Component>
    ),

    titleRemoveYourBallot: () => (
      <Component uiStringKey="titleRemoveYourBallot">
        Remove Your Ballot
      </Component>
    ),

    titleScannerBallotNotCounted: () => (
      <Component uiStringKey="titleScannerBallotNotCounted">
        Ballot Not Counted
      </Component>
    ),

    titleScannerInsertBallotScreen: () => (
      <Component uiStringKey="titleScannerInsertBallotScreen">
        Insert Your Ballot
      </Component>
    ),

    titleScannerBallotWarningsScreen: () => (
      <Component uiStringKey="titleScannerBallotWarningsScreen">
        Review Your Ballot
      </Component>
    ),

    titleScannerNoVotesWarning: () => (
      <Component uiStringKey="titleScannerNoVotesWarning">
        No votes marked:
      </Component>
    ),

    titleScannerOvervoteWarning: () => (
      <Component uiStringKey="titleScannerOvervoteWarning">
        Too many votes marked:
      </Component>
    ),

    titleScannerProcessingScreen: () => (
      <Component uiStringKey="titleScannerProcessingScreen">
        Please wait…
      </Component>
    ),

    titleBallotSuccessfullyCastPage: () => (
      <Component uiStringKey="titleBallotSuccessfullyCastPage">
        Your ballot was cast!
      </Component>
    ),

    titleScannerSuccessScreen: () => (
      <Component uiStringKey="titleScannerSuccessScreen">
        Your ballot was counted!
      </Component>
    ),

    titleScannerUndervoteWarning: () => (
      <Component uiStringKey="titleScannerUndervoteWarning">
        You may add one or more votes:
      </Component>
    ),

    titleScanningFailed: () => (
      <Component uiStringKey="titleScanningFailed">Scanning Failed</Component>
    ),

    titleUnofficialTestBallot: () => (
      <Component uiStringKey="titleUnofficialTestBallot">
        Unofficial TEST Ballot
      </Component>
    ),

    warningBmdInactiveSession: () => (
      <Component uiStringKey="warningBmdInactiveSession">
        This voting station has been inactive for more than 5 minutes.
      </Component>
    ),

    warningBmdInactiveTimeRemaining: () => (
      <Component uiStringKey="warningBmdInactiveTimeRemaining">
        To protect your privacy, this ballot will be cleared when the timer runs
        out.
      </Component>
    ),

    warningOvervoteCandidateContest: () => (
      <Component uiStringKey="warningOvervoteCandidateContest">
        To vote for another candidate, you must first deselect a previously
        selected candidate.
      </Component>
    ),

    warningOvervoteYesNoContest: () => (
      <Component uiStringKey="warningOvervoteYesNoContest">
        To change your vote, first deselect your previous vote.
      </Component>
    ),

    warningNoPower: () => (
      <Component uiStringKey="warningNoPower">
        <Font weight="bold">No Power Detected.</Font> Please ask a poll worker
        to plug in the power cord.
      </Component>
    ),

    warningNoVotesForContest: () => (
      <Component uiStringKey="warningNoVotesForContest">
        You may still vote in this contest.
      </Component>
    ),

    warningProblemScanningBallot: () => (
      <Component uiStringKey="warningProblemScanningBallot">
        There was a problem scanning this ballot.
      </Component>
    ),

    warningProblemScanningBallotScanAgain: () => (
      <Component uiStringKey="warningProblemScanningBallotScanAgain">
        There was a problem scanning your ballot. Please scan it again.
      </Component>
    ),

    warningScannerAnotherScanInProgress: () => (
      <Component uiStringKey="warningScannerAnotherScanInProgress">
        Another ballot is being scanned.
      </Component>
    ),

    warningScannerJammed: () => (
      <Component uiStringKey="warningScannerJammed">
        The ballot is jammed in the scanner.
      </Component>
    ),

    warningScannerBlankBallotSubmission: () => (
      <Component uiStringKey="warningScannerBlankBallotSubmission">
        No votes will be counted from this ballot.
      </Component>
    ),

    warningScannerLiveBallotInTestMode: () => (
      <Component uiStringKey="warningScannerLiveBallotInTestMode">
        The scanner is in test mode and a live ballot was detected.
      </Component>
    ),

    warningScannerMismatchedElection: () => (
      <Component uiStringKey="warningScannerMismatchedElection">
        The ballot does not match the election this scanner is configured for.
      </Component>
    ),

    warningScannerMismatchedPrecinct: () => (
      <Component uiStringKey="warningScannerMismatchedPrecinct">
        The ballot does not match the precinct this scanner is configured for.
      </Component>
    ),

    warningScannerMultipleSheetsDetected: () => (
      <Component uiStringKey="warningScannerMultipleSheetsDetected">
        Multiple sheets detected.
      </Component>
    ),

    warningScannerNoVotesFound: () => (
      <Component uiStringKey="warningScannerNoVotesFound">
        No votes were found when scanning this ballot.
      </Component>
    ),

    warningScannerTestBallotInLiveMode: () => (
      <Component uiStringKey="warningScannerTestBallotInLiveMode">
        The scanner is in live mode and a test ballot was detected.
      </Component>
    ),
  };
}

export const appStrings = generateAppStrings(UiString);
export const backendAppStrings = generateAppStrings(BackendUiString);

export type AppStringKey = keyof typeof appStrings;
