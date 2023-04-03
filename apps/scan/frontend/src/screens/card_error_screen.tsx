import React from 'react';

import { CenteredLargeProse, RotateCardImage } from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';

export function CardErrorScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      <RotateCardImage />
      <CenteredLargeProse>
        <h1>Card is Backwards</h1>
        <p>Remove the card, turn it around, and insert it again.</p>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <CardErrorScreen />;
}
