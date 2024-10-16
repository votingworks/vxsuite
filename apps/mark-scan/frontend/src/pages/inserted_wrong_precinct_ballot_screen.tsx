import { appStrings, Caption, Icons, P } from '@votingworks/ui';

import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

export function InsertedWrongPrecinctBallotScreen(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning color="warning" />}
      title="Wrong Precinct"
      voterFacing={false}
    >
      <P>{appStrings.warningBmdInvalidBallotWrongPrecinct()}</P>
      <P>Remove the sheet and insert a ballot for the configured precinct.</P>
      <Caption>
        <Icons.Info /> Insert a blank sheet to start a new voting session.
      </Caption>
    </CenteredCardPageLayout>
  );
}
