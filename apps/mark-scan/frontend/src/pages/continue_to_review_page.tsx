import {
  LinkButton,
  appStrings,
  AudioOnly,
  P,
  PageNavigationButtonId,
} from '@votingworks/ui';
import { CenteredPageLayout } from '../components/centered_page_layout';

// This page is rendered as part of the blank ballot interpretation flow immediately after
// the poll worker card is removed. To protect voter privacy, we render this screen first to
// ask the voter to approve before showing ballot selections on screen.
export function ContinueToReviewPage(): JSX.Element {
  return (
    <CenteredPageLayout
      title={appStrings.titleBmdReadyToReview()}
      buttons={
        <LinkButton
          autoFocus
          to="/review"
          id={PageNavigationButtonId.NEXT}
          variant="primary"
          icon="Done"
        >
          {appStrings.buttonReturnToBallotReview()}
        </LinkButton>
      }
      voterFacing
    >
      <P>{appStrings.noteBmdBallotSheetLoaded()}</P>
      <AudioOnly>{appStrings.instructionsBmdSelectToContinue()}</AudioOnly>
    </CenteredPageLayout>
  );
}
