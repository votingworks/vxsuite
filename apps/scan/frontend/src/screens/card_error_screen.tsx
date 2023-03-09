import React from 'react';

import { InvalidCardScreen } from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';

export function CardErrorScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      <InvalidCardScreen reason="card_error" />
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <CardErrorScreen />;
}
