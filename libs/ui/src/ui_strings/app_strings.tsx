import { DateString } from './date_string';
import { NumberString } from './number_string';
import { UiString } from './ui_string';

// TODO(kofi): Add lint rule to ensure object keys match uiStringKey props.

/* istanbul ignore next - mostly presentational, tested via apps where relevant */
export const appStrings = {
  // TODO(kofi): Fill out.

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

  buttonChange: () => <UiString uiStringKey="buttonChange">Change</UiString>,

  buttonDisplaySettings: () => (
    <UiString uiStringKey="buttonDisplaySettings">Color/Size</UiString>
  ),

  buttonMore: () => <UiString uiStringKey="buttonMore">More</UiString>,

  buttonNext: () => <UiString uiStringKey="buttonNext">Next</UiString>,

  buttonPrintBallot: () => (
    <UiString uiStringKey="buttonPrintBallot">Print My Ballot</UiString>
  ),

  buttonStartVoting: () => (
    <UiString uiStringKey="buttonStartVoting">Start Voting</UiString>
  ),

  buttonReview: () => <UiString uiStringKey="buttonReview">Review</UiString>,

  // TODO(kofi): Remove `date` and `number` and have consumers use the
  // components directly, since this indirection doesn't provided added value.
  date: (value: Date) => <DateString value={value} />,

  instructionsBmdBallotNavigation: () => (
    <UiString uiStringKey="instructionsBmdBallotNavigation">
      When voting with the text-to-speech audio, use the accessible controller
      to navigate your ballot. To navigate through the contests, use the left
      and right buttons. To navigate through contest choices, use the up and
      down buttons. To select or unselect a contest choice as your vote, use the
      select button. Press the right button now to advance to the first contest.
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

  labelAllPrecinctsSelection: () => (
    <UiString uiStringKey="labelAllPrecinctsSelection">All Precincts</UiString>
  ),

  labelBallotStyle: () => (
    <UiString uiStringKey="labelBallotStyle">Ballot style:</UiString>
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

  labelWriteInParenthesized: () => (
    <UiString uiStringKey="labelWriteInParenthesized">(write-in)</UiString>
  ),

  // TODO(kofi): Remove `date` and `number` and have consumers use the
  // components directly, since this indirection doesn't provided added value.
  number: (value: number) => <NumberString value={value} />,

  titleBmdReviewScreen: () => (
    <UiString uiStringKey="titleBmdReviewScreen">Review Your Votes</UiString>
  ),

  warningNoVotesForContest: () => (
    <UiString uiStringKey="warningNoVotesForContest">
      You may still vote in this contest.
    </UiString>
  ),
} as const;
