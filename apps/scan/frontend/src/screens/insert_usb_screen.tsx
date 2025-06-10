import { H1, P } from '@votingworks/ui';
import React from 'react';
import { CenteredText, ScreenMainCenterChild } from '../components/layout';
import * as api from '../api';

export function InsertUsbScreen(): JSX.Element {
  const playSound = api.playSound.useMutation().mutate;
  React.useEffect(() => playSound({ name: 'alarm' }), [playSound]);

  return (
    <ScreenMainCenterChild voterFacing={false} showTestModeBanner={false}>
      <CenteredText>
        <H1>No USB Drive Detected</H1>
        <P>Insert a USB drive into the USB hub.</P>
      </CenteredText>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next - @preserve */
export function DefaultPreview(): JSX.Element {
  return <InsertUsbScreen />;
}
