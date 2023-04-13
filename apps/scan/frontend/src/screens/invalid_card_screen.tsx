import React from 'react';

import { InvalidCardScreen as SharedInvalidCardScreen } from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';

export function InvalidCardScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBarMode="pollworker">
      <SharedInvalidCardScreen
        reason="invalid_user_on_card"
        recommendedAction="Remove the card to continue."
      />
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <InvalidCardScreen />;
}
