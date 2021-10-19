import React from 'react';

import { CenteredLargeProse, CenteredScreen } from '../components/Layout';
import { TimesCircle } from '../components/Graphics';

const InvalidCardScreen = (): JSX.Element => (
  <CenteredScreen infoBar={false}>
    <TimesCircle />
    <CenteredLargeProse>
      <h1>Invalid Card, please remove.</h1>
    </CenteredLargeProse>
  </CenteredScreen>
);

export default InvalidCardScreen;

/* istanbul ignore next */
export const DefaultPreview = (): JSX.Element => {
  return <InvalidCardScreen />;
};
