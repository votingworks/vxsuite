import React from 'react';
import { Text } from '@votingworks/ui';
import {
  ScreenMainCenterChild,
  CenteredLargeProse,
} from '../components/layout';

interface Props {
  batteryIsCharging: boolean;
}

export function SetupScannerScreen({ batteryIsCharging }: Props): JSX.Element {
  // If the power cord is plugged in, but we can't detect a scanner, it's an
  // internal wiring issue. Otherwise if we can't detect the scanner, the power
  // cord is likely not plugged in.
  return (
    <ScreenMainCenterChild infoBar={false}>
      {batteryIsCharging ? (
        <CenteredLargeProse>
          <h1>Internal Connection Problem</h1>
          <Text italic>Please ask a poll worker for help.</Text>
        </CenteredLargeProse>
      ) : (
        <CenteredLargeProse>
          <h1>No Power Detected</h1>
          <Text italic>
            Please ask a poll worker to plug in the power cord.
          </Text>
        </CenteredLargeProse>
      )}
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function PowerDisconnectedPreview(): JSX.Element {
  return <SetupScannerScreen batteryIsCharging={false} />;
}

/* istanbul ignore next */
export function ScannerDisconnectedPreview(): JSX.Element {
  return <SetupScannerScreen batteryIsCharging />;
}
