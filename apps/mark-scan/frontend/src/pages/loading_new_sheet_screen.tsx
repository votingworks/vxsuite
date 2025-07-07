import { Icons } from '@votingworks/ui';

import React from 'react';
import { CenteredCardPageLayout } from '@votingworks/mark-flow-ui';

export function LoadingNewSheetScreen(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Info />}
      title={
        <React.Fragment>
          <Icons.Loading /> Loading Sheet
        </React.Fragment>
      }
      voterFacing={false}
    />
  );
}
