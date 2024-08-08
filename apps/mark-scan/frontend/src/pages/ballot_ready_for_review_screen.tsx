import { Icons, P } from '@votingworks/ui';

import { CenteredCardPageLayout } from '../components/centered_card_page_layout';
import { ResetVoterSessionButton } from '../components/deactivate_voter_session_button';

export function BallotReadyForReviewScreen(): JSX.Element {
  return (
    <CenteredCardPageLayout
      buttons={<ResetVoterSessionButton />}
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
