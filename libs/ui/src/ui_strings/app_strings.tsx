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

  number: (value: number) => <NumberString value={value} />,

  // TODO(kofi): Remove in favour of `labelNumVotesRemaining`
  numSeatsInstructions: (numSeats: number) =>
    // These are split out into individual strings instead of an interpolated
    // one to support generating non-interpolated audio for each one, for a
    // better voter experience.
    // This pattern only makes sense when there's a very limited value space.
    ({
      1: <UiString uiStringKey="numSeatsInstructions.1">Vote for 1.</UiString>,
      2: <UiString uiStringKey="numSeatsInstructions.2">Vote for 2.</UiString>,
      3: <UiString uiStringKey="numSeatsInstructions.3">Vote for 3.</UiString>,
      4: <UiString uiStringKey="numSeatsInstructions.4">Vote for 4.</UiString>,
      // TODO(kofi): Find out what a reasonable upper limit is for the number of
      // possible votes per contest.
    })[numSeats],

  // TODO(kofi): Remove in favour of `labelNumVotesRemaining`
  numVotesSelected: (numVotes: number) =>
    ({
      1: (
        <UiString uiStringKey="numVotesSelected.1">
          You have selected 1.
        </UiString>
      ),
      2: (
        <UiString uiStringKey="numVotesSelected.2">
          You have selected 2.
        </UiString>
      ),
      3: (
        <UiString uiStringKey="numVotesSelected.3">
          You have selected 3.
        </UiString>
      ),
      4: (
        <UiString uiStringKey="numVotesSelected.4">
          You have selected 4.
        </UiString>
      ),
      // TODO(kofi): Same as above: find numVotes upper limit.
    })[numVotes],

  // TODO(kofi): Remove in favour of `labelNumVotesRemaining`
  numVotesRemaining: (numRemaining: number) =>
    ({
      1: (
        <UiString uiStringKey="numVotesRemaining.1">
          You may select 1 more.
        </UiString>
      ),
      2: (
        <UiString uiStringKey="numVotesRemaining.2">
          You may select 2 more.
        </UiString>
      ),
      3: (
        <UiString uiStringKey="numVotesRemaining.3">
          You may select 3 more.
        </UiString>
      ),
      4: (
        <UiString uiStringKey="numVotesRemaining.4">
          You may select 4 more.
        </UiString>
      ),
      // TODO(kofi): Same as above: find numRemaining upper limit.
    })[numRemaining],

  titleBmdReviewScreen: () => (
    <UiString uiStringKey="titleBmdReviewScreen">Review Your Votes</UiString>
  ),

  warningNoVotesForContest: () => (
    <UiString uiStringKey="warningNoVotesForContest">
      You may still vote in this contest.
    </UiString>
  ),
} as const;
