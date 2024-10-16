import { Icons } from '@votingworks/ui';

import React from 'react';
import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

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
