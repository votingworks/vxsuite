import React from 'react';

import { Text } from '@votingworks/ui';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';
import { TimesCircle } from '../components/graphics';

export function InvalidCardScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      <TimesCircle />
      <CenteredLargeProse>
        <h1>Invalid Card</h1>
        <Text small italic>
          Remove the card to continue.
        </Text>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <InvalidCardScreen />;
}
