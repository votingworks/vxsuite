import React from 'react';

import { CenteredLargeProse, CenteredScreen } from '../components/layout';
import { TimesCircle } from '../components/graphics';

export function InvalidCardScreen(): JSX.Element {
  return (
    <CenteredScreen infoBar={false}>
      <TimesCircle />
      <CenteredLargeProse>
        <h1>Invalid Card, please remove.</h1>
      </CenteredLargeProse>
    </CenteredScreen>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <InvalidCardScreen />;
}
