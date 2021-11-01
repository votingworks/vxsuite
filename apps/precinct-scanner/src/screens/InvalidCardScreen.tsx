import React from 'react';

import { CenteredLargeProse, CenteredScreen } from '../components/Layout';
import { TimesCircle } from '../components/Graphics';

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
