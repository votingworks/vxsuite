/* istanbul ignore file - trivial presentational component. */

import { Icons, P } from '@votingworks/ui';
import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

export function RemoveJammedSheetScreen(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning color="warning" />}
      title="Paper is Jammed"
      voterFacing={false}
    >
      <P>
        Please remove the jammed sheet, opening the printer cover or ballot box
        if necessary.
      </P>
    </CenteredCardPageLayout>
  );
}
