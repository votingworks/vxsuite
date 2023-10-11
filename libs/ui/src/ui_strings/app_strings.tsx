import { UiString } from './ui_string';

// TODO(kofi): Add lint rule to ensure object keys match uiStringKey props.

/* istanbul ignore next - mostly presentational, tested via apps where relevant */
export const appStrings = {
  // TODO(kofi): Fill out.

  buttonAddWriteIn: () => (
    <UiString uiStringKey="buttonAddWriteIn">add write-in candidate</UiString>
  ),

  buttonBack: () => <UiString uiStringKey="buttonBack">Back</UiString>,

  buttonDisplaySettings: () => (
    <UiString uiStringKey="buttonDisplaySettings">Color/Size</UiString>
  ),

  buttonNext: () => <UiString uiStringKey="buttonNext">Next</UiString>,

  buttonReview: () => <UiString uiStringKey="buttonReview">Review</UiString>,

  contestNavigationInstructions: () => (
    <UiString uiStringKey="contestNavigationInstructions">
      To navigate through the contest choices, use the down button. To move to
      the next contest, use the right button.
    </UiString>
  ),

  numSeatsInstructions: (numSeats: number) =>
    // These are split out into individual strings instead of an interpolated
    // one to support generating non-interpolated audio for each one, for a
    // better voter experience.
    // This pattern only makes sense when there's a very limited value space.
    ({
      1: (
        <UiString uiStringKey="numSeatsInstructions" uiStringSubKey="1">
          Vote for 1.
        </UiString>
      ),
      2: (
        <UiString uiStringKey="numSeatsInstructions" uiStringSubKey="2">
          Vote for 2.
        </UiString>
      ),
      3: (
        <UiString uiStringKey="numSeatsInstructions" uiStringSubKey="3">
          Vote for 3.
        </UiString>
      ),
      4: (
        <UiString uiStringKey="numSeatsInstructions" uiStringSubKey="4">
          Vote for 4.
        </UiString>
      ),
      // TODO(kofi): Find out what a reasonable upper limit is for the number of
      // possible votes per contest.
    })[numSeats],

  numVotesSelected: (numVotes: number) =>
    ({
      1: (
        <UiString uiStringKey="numVotesSelected" uiStringSubKey="1">
          You have selected 1.
        </UiString>
      ),
      2: (
        <UiString uiStringKey="numVotesSelected" uiStringSubKey="2">
          You have selected 2.
        </UiString>
      ),
      3: (
        <UiString uiStringKey="numVotesSelected" uiStringSubKey="3">
          You have selected 3.
        </UiString>
      ),
      4: (
        <UiString uiStringKey="numVotesSelected" uiStringSubKey="4">
          You have selected 4.
        </UiString>
      ),
      // TODO(kofi): Same as above: find numVotes upper limit.
    })[numVotes],

  numVotesRemaining: (numRemaining: number) =>
    ({
      1: (
        <UiString uiStringKey="numVotesRemaining" uiStringSubKey="1">
          You may select 1 more.
        </UiString>
      ),
      2: (
        <UiString uiStringKey="numVotesRemaining" uiStringSubKey="2">
          You may select 2 more.
        </UiString>
      ),
      3: (
        <UiString uiStringKey="numVotesRemaining" uiStringSubKey="3">
          You may select 3 more.
        </UiString>
      ),
      4: (
        <UiString uiStringKey="numVotesRemaining" uiStringSubKey="4">
          You may select 4 more.
        </UiString>
      ),
      // TODO(kofi): Same as above: find numRemaining upper limit.
    })[numRemaining],
} as const;
