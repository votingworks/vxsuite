import React from 'react';

import { CenteredLargeProse, CenteredScreen } from '../components/layout';
import { TimesCircle } from '../components/graphics';

export function CardErrorScreen(): JSX.Element {
  return (
    <CenteredScreen infoBar={false}>
      <TimesCircle />
      <CenteredLargeProse>
        <h1>Card is backwards</h1>
        <p>Remove the card, turn it around, and insert it again.</p>
      </CenteredLargeProse>
    </CenteredScreen>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <CardErrorScreen />;
}
