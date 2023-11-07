import { ButtonFooter } from '@votingworks/mark-flow-ui';
import {
  Main,
  Screen,
  H1,
  LinkButton,
  appStrings,
  AudioOnly,
  Font,
  P,
} from '@votingworks/ui';

// This page is rendered as part of the blank ballot interpretation flow immediately after
// the poll worker card is removed. To protect voter privacy, we render this screen first to
// ask the voter to approve before showing ballot selections on screen.
export function ContinueToReviewPage(): JSX.Element {
  return (
    <Screen white>
      <Main padded centerChild>
        <Font align="center" id="audiofocus">
          <H1>{appStrings.titleBmdReadyToReview()}</H1>
          <P>{appStrings.noteBmdBallotSheetLoaded()}</P>
          <AudioOnly>{appStrings.instructionsBmdSelectToContinue()}</AudioOnly>
        </Font>
      </Main>
      <ButtonFooter>
        <LinkButton
          autoFocus
          to="/review"
          id="next"
          variant="primary"
          icon="Done"
        >
          {appStrings.buttonReturnToBallotReview()}
        </LinkButton>
      </ButtonFooter>
    </Screen>
  );
}
