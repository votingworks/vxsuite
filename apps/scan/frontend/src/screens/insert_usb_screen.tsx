import { CenteredLargeProse, H1, P } from '@votingworks/ui';
import React from 'react';
import { ScreenMainCenterChild } from '../components/layout';

export function InsertUsbScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      <CenteredLargeProse>
        <H1>No USB Drive Detected</H1>
        <P>Insert USB drive into the USB hub.</P>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <InsertUsbScreen />;
}
