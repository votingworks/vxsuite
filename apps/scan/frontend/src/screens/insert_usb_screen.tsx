import { H1, P } from '@votingworks/ui';
import React from 'react';
import { CenteredText, ScreenMainCenterChild } from '../components/layout';
import { useSound } from '../utils/use_sound';

export function InsertUsbScreen(): JSX.Element {
  const playAlarm = useSound('alarm');
  React.useEffect(() => playAlarm(), [playAlarm]);

  return (
    <ScreenMainCenterChild voterFacing={false}>
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
