import React from 'react';
import { CenteredScreen, CenteredLargeProse } from '../components/layout';

export function InsertUsbScreen(): JSX.Element {
  return (
    <CenteredScreen infoBar={false}>
      <CenteredLargeProse>
        <h1>No USB Drive Detected</h1>
        <p>Insert USB drive into the USB hub.</p>
      </CenteredLargeProse>
    </CenteredScreen>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <InsertUsbScreen />;
}
