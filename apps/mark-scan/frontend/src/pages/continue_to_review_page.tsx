import { ButtonFooter } from '@votingworks/mark-flow-ui';
import { Main, Screen, Text, H1, LinkButton } from '@votingworks/ui';

// This page is rendered as part of the blank ballot interpretation flow immediately after
// the poll worker card is removed. To protect voter privacy, we render this screen first to
// ask the voter to approve before showing ballot selections on screen.
export function ContinueToReviewPage(): JSX.Element {
  return (
    <Screen white>
      <Main padded centerChild>
        <Text center>
          <H1>Ready to Review</H1>
          <p>
            The ballot sheet has been loaded. You will have a chance to review
            your selections before reprinting your ballot.
          </p>
        </Text>
      </Main>
      <ButtonFooter>
        <LinkButton to="/review" id="next" variant="primary" icon="Done">
          Return to Ballot Review
        </LinkButton>
      </ButtonFooter>
    </Screen>
  );
}
