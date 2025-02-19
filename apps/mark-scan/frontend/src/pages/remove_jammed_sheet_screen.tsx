/* istanbul ignore file - trivial presentational component. @preserve */

import { Caption, Icons, P } from '@votingworks/ui';
import { CenteredCardPageLayout } from '../components/centered_card_page_layout';
import { ResetVoterSessionButton } from '../components/deactivate_voter_session_button';

export function RemoveJammedSheetScreen(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning color="warning" />}
      title="Paper is Jammed"
      voterFacing={false}
      buttons={<ResetVoterSessionButton />}
    >
      <P>
        Please remove the jammed sheet, opening the printer cover or ballot box
        if necessary.
      </P>
      <Caption>
        <Icons.Info /> To end the current voter session and start over, press
        the button below to deactivate the voter session.
      </Caption>
    </CenteredCardPageLayout>
  );
}
