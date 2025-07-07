import React from 'react';

import { Icons, P } from '@votingworks/ui';

import { CenteredCardPageLayout } from '@votingworks/mark-flow-ui';

export function InsertedBlankSheetInsteadOfBallotScreen(): React.ReactNode {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning color="warning" />}
      title="No Ballot Detected"
      voterFacing={false}
    >
      <P>
        Remove the sheet and insert a valid ballot with the printed side facing
        upwards.
      </P>
    </CenteredCardPageLayout>
  );
}
