/* eslint-disable react/no-unescaped-entities */

import { Font } from '../typography';
import { UiString } from './ui_string';

// TODO(kofi): Add lint rule to ensure object keys match uiStringKey props.

/* istanbul ignore next - mostly presentational, tested via apps where relevant */
export const appStrings = {
  // TODO(kofi): Fill out.

  buttonAccept: () => <UiString uiStringKey="buttonAccept">Accept</UiString>,

  buttonAddWriteIn: () => (
    <UiString uiStringKey="buttonAddWriteIn">add write-in candidate</UiString>
  ),

  buttonBack: () => <UiString uiStringKey="buttonBack">Back</UiString>,

  buttonBallotIsCorrect: () => (
    <UiString uiStringKey="buttonBallotIsCorrect">
      My Ballot is Correct
    </UiString>
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

  buttonCancel: () => <UiString uiStringKey="buttonCancel">Cancel</UiString>,

  buttonCastBallotAsIs: () => (
    <UiString uiStringKey="buttonCastBallotAsIs">Cast Ballot As Is</UiString>
  ),

  buttonChange: () => <UiString uiStringKey="buttonChange">Change</UiString>,

  buttonClose: () => <UiString uiStringKey="buttonClose">Close</UiString>,

  buttonDone: () => <UiString uiStringKey="buttonDone">Done</UiString>,

  buttonDisplaySettings: () => (
    <UiString uiStringKey="buttonDisplaySettings">Color/Size</UiString>
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
    <UiString uiStringKey="buttonViewContests">View contests</UiString>
  ),

  buttonYes: () => <UiString uiStringKey="buttonYes">Yes</UiString>,

  buttonYesCastBallotAsIs: () => (
    <UiString uiStringKey="buttonYesCastBallotAsIs">
      Yes, Cast Ballot As Is
    </UiString>
  ),

  instructionsBmdBallotNavigation: () => (
    <UiString uiStringKey="instructionsBmdBallotNavigation">
      When voting with the text-to-speech audio, use the accessible controller
      to navigate your ballot. To navigate through the contests, use the left
      and right buttons. To navigate through contest choices, use the up and
      down buttons. To select or unselect a contest choice as your vote, use the
      select button. Press the right button now to advance to the first contest.
    </UiString>
  ),

  instructionsBmdCastBallotPreamble: () => (
    <UiString uiStringKey="instructionsBmdCastBallotPreamble">
      Your official ballot is printing. Complete the following steps to finish
      voting:
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

  instructionsBmdContestNavigation: () => (
    <UiString uiStringKey="instructionsBmdContestNavigation">
      To navigate through the contest choices, use the down button. To move to
      the next contest, use the right button.
    </UiString>
  ),

  instructionsBmdInvalidatedBallot: () => (
    <UiString uiStringKey="instructionsBmdInvalidatedBallot">
      You have indicated your ballot needs changes. Please alert a poll worker
      to invalidate your incorrect ballot and restart your voting session.
    </UiString>
  ),

  instructionsBmdLoadPaper: () => (
    <UiString uiStringKey="instructionsBmdLoadPaper">
      Please feed one sheet of paper into the front input tray. The printer will
      automatically grab the paper when positioned correctly.
    </UiString>
  ),

  instructionsBmdPaperJam: () => (
    <UiString uiStringKey="instructionsBmdPaperJam">
      Please alert a poll worker to clear the jam, opening the printer cover or
      ballot box if necessary.
    </UiString>
  ),

  instructionsBmdReviewPageNavigation: () => (
    <UiString uiStringKey="instructionsBmdReviewPageNavigation">
      To review your votes, advance through the ballot contests using the up and
      down buttons.
    </UiString>
  ),

  instructionsBmdReviewPageChangingVotes: () => (
    <UiString uiStringKey="instructionsBmdReviewPageChangingVotes">
      To change your vote in any contest, use the select button to navigate to
      that contest. When you are finished making your ballot selections and
      ready to print your ballot, use the right button to print your ballot.
    </UiString>
  ),

  // TODO(kofi): I think these instructions could be improved a bit. Not sure
  // it's obvious to a vision-impaired voter that they have to navigate down to
  // the confirm/reject buttons at the bottom of the screen.
  instructionsBmdScanReviewConfirmation: () => (
    <UiString uiStringKey="instructionsBmdScanReviewConfirmation">
      If your selections are correct, press "My Ballot is Correct”. If there is
      an error, press "My Ballot is Incorrect” and alert a poll worker.
    </UiString>
  ),

  instructionsBmdSelectToContinue: () => (
    <UiString uiStringKey="instructionsBmdSelectToContinue">
      Press the select button to continue.
    </UiString>
  ),

  instructionsBmdWriteInFormNavigation: () => (
    <UiString uiStringKey="instructionsBmdWriteInFormNavigation">
      Use the up and down buttons to navigate between the letters of a standard
      keyboard. Use the select button to select the current letter.
    </UiString>
  ),

  instructionsScannerInsertBallotScreen: () => (
    <UiString uiStringKey="instructionsScannerInsertBallotScreen">
      Scan one ballot sheet at a time.
    </UiString>
  ),

  labelAllPrecinctsSelection: () => (
    <UiString uiStringKey="labelAllPrecinctsSelection">All Precincts</UiString>
  ),

  labelNumBallotsScanned: () => (
    <UiString uiStringKey="labelNumBallotsScanned">Ballots Scanned</UiString>
  ),

  labelBallotStyle: () => (
    <UiString uiStringKey="labelBallotStyle">Ballot style:</UiString>
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

  noteAskPollWorkerForHelp: () => (
    <UiString uiStringKey="noteAskPollWorkerForHelp">
      Ask a poll worker if you need help.
    </UiString>
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

  noteBmdSessionRestart: () => (
    <UiString uiStringKey="noteBmdSessionRestart">
      Your voting session will restart shortly.
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

  noteScannerUndervoteContestsCardPlural: () => (
    <UiString uiStringKey="noteScannerUndervoteContestsCardPlural">
      All other votes in these contests will count, even if you leave some
      blank.
    </UiString>
  ),

  noteScannerUndervoteContestsCardSingular: () => (
    <UiString uiStringKey="noteScannerUndervoteContestsCardSingular">
      All other votes in this contest will count, even if you leave some blank.
    </UiString>
  ),

  promptBmdConfirmRemoveWriteIn: () => (
    <UiString uiStringKey="promptBmdConfirmRemoveWriteIn">
      Do you want to deselect and remove your write-in candidate?
    </UiString>
  ),

  titleBmdAskForHelpScreen: () => (
    <UiString uiStringKey="titleBmdAskForHelpScreen">
      Ask a Poll Worker for Help
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

  titleBmdJamClearedScreen: () => (
    <UiString uiStringKey="titleBmdJamClearedScreen">Jam Cleared</UiString>
  ),

  titleBmdJammedScreen: () => (
    <UiString uiStringKey="titleBmdJammedScreen">Paper is Jammed</UiString>
  ),

  titleBmdLoadPaperScreen: () => (
    <UiString uiStringKey="titleBmdLoadPaperScreen">
      Load Blank Ballot Sheet
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

  titleDisplaySettings: () => (
    <UiString uiStringKey="titleDisplaySettings">Display Settings:</UiString>
  ),

  titleDisplaySettingsColor: () => (
    <UiString uiStringKey="titleDisplaySettingsColor">Color</UiString>
  ),

  titleDisplaySettingsSize: () => (
    <UiString uiStringKey="titleDisplaySettingsSize">Text Size</UiString>
  ),

  titleModalAreYouSure: () => (
    <UiString uiStringKey="titleModalAreYouSure">Are you sure?</UiString>
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

  titleScannerOvervoteWarning: () => (
    <UiString uiStringKey="titleScannerOvervoteWarning">
      Too many votes marked:
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

  warningScannerBlankBallotSubmission: () => (
    <UiString uiStringKey="warningScannerBlankBallotSubmission">
      No votes will be counted from this ballot.
    </UiString>
  ),

  warningScannerNoVotesFound: () => (
    <UiString uiStringKey="warningScannerNoVotesFound">
      No votes were found when scanning this ballot.
    </UiString>
  ),

  warningNoPower: () => (
    <UiString uiStringKey="warningNoPower">
      <Font weight="bold">No Power Detected.</Font> Please ask a poll worker to
      plug in the power cord.
    </UiString>
  ),
} as const;

export type AppStringKey = keyof typeof appStrings;
