import React from 'react';

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
        <h1>Invalid Card, please remove.</h1>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <InvalidCardScreen />;
}
