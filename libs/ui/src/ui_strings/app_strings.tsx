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

  buttonChange: () => <UiString uiStringKey="buttonChange">Change</UiString>,

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

  buttonPrintBallot: () => (
    <UiString uiStringKey="buttonPrintBallot">Print My Ballot</UiString>
  ),

  buttonReview: () => <UiString uiStringKey="buttonReview">Review</UiString>,

  buttonStartVoting: () => (
    <UiString uiStringKey="buttonStartVoting">Start Voting</UiString>
  ),

  buttonYes: () => <UiString uiStringKey="buttonYes">Yes</UiString>,

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
      If your selections are correct, press “My Ballot is Correct”. If there is
      an error, press “My Ballot is Incorrect” and alert a poll worker.
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

  labelAllPrecinctsSelection: () => (
    <UiString uiStringKey="labelAllPrecinctsSelection">All Precincts</UiString>
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

  labelDeselectedCandidate: () => (
    <UiString uiStringKey="labelDeselectedCandidate">Deselected:</UiString>
  ),

  labelDeselectedOption: () => (
    <UiString uiStringKey="labelDeselectedOption">Deselected option:</UiString>
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

  labelSelectedCandidate: () => (
    <UiString uiStringKey="labelSelectedCandidate">Selected:</UiString>
  ),

  labelSelectedOption: () => (
    <UiString uiStringKey="labelSelectedOption">Selected option:</UiString>
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

  noteClearingBallot: () => (
    <UiString uiStringKey="noteClearingBallot">Clearing ballot</UiString>
  ),

  promptBmdConfirmRemoveWriteIn: () => (
    <UiString uiStringKey="promptBmdConfirmRemoveWriteIn">
      Do you want to deselect and remove your write-in candidate?
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

  titleBmdPrintScreen: () => (
    <UiString uiStringKey="titleBmdPrintScreen">
      Printing Your Official Ballot...
    </UiString>
  ),

  titleBmdReviewScreen: () => (
    <UiString uiStringKey="titleBmdReviewScreen">Review Your Votes</UiString>
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
} as const;

export type AppStringKey = keyof typeof appStrings;
