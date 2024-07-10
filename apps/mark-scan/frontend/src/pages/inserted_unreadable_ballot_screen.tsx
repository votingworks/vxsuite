import { Caption, Icons, P } from '@votingworks/ui';

import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

export function InsertedUnreadableBallotScreen(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning color="warning" />}
      title="Unable to Read Ballot"
      voterFacing={false}
    >
      <P>
        There was a problem while reading the ballot information on the inserted
        sheet.
      </P>
      <P>
        Please remove the sheet and insert a valid BMD ballot for the configured
        election.
      </P>
      <Caption>
        <Icons.Info /> Insert a blank sheet to start a new voting session.
      </Caption>
    </CenteredCardPageLayout>
  );
}
