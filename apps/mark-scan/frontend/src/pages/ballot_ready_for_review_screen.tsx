import { Button, Icons, P } from '@votingworks/ui';

import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

export interface BallotReadyForReviewScreenProps {
  resetCardlessVoterSession: () => void;
}

export function BallotReadyForReviewScreen(
  props: BallotReadyForReviewScreenProps
): JSX.Element {
  const { resetCardlessVoterSession } = props;

  return (
    <CenteredCardPageLayout
      buttons={
        <Button onPress={resetCardlessVoterSession} variant="danger">
          Deactivate Voting Session
        </Button>
      }
      icon={<Icons.Done color="success" />}
      title="Remove Poll Worker Card"
      voterFacing={false}
    >
      <P>The ballot is ready for review.</P>
      <P>
        Remove the poll worker card to allow the voter to review and cast their
        ballot.
      </P>
    </CenteredCardPageLayout>
  );
}
