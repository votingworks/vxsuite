/* istanbul ignore file - trivial presentational component. @preserve */

import { Icons, P } from '@votingworks/ui';
import { CenteredCardPageLayout } from '@votingworks/mark-flow-ui';

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
