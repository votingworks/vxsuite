import { appStrings, Caption, Icons, P } from '@votingworks/ui';

import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

export function InsertedWrongElectionBallotScreen(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning color="warning" />}
      title="Wrong Election"
      voterFacing={false}
    >
      <P>{appStrings.warningBmdInvalidBallotWrongElection()}</P>
      <P>Remove the sheet and insert a ballot for the configured election.</P>
      <Caption>
        <Icons.Info /> Insert a blank sheet to start a new voting session.
      </Caption>
    </CenteredCardPageLayout>
  );
}
