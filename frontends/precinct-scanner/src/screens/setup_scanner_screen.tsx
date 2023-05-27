import React, { useState, useEffect } from 'react';
import { Text } from '@votingworks/ui';
import {
  ScreenMainCenterChild,
  CenteredLargeProse,
} from '../components/layout';
import { ScannedBallotCount } from '../components/scanned_ballot_count';
import { useSound } from '../hooks/use_sound';

interface Props {
  batteryIsCharging: boolean;
  scannedBallotCount?: number;
}

export function SetupScannerScreen({
  batteryIsCharging,
  scannedBallotCount,
}: Props): JSX.Element {
  // If the power cord is plugged in, but we can't detect a scanner, it's an
  // internal wiring issue or a plustek crash. Otherwise if we can't detect the scanner, the power
  // cord is likely not plugged in.

  // However, we have an additional complication, we can't tell immediately if
  // the power has been disconnected. It can take up to 3 seconds.

  const [waitedForChargingConfirmation, setWaitedForChargingConfirmation] =
    useState(false);

  const [scannerNeedsRestart, setScannerNeedsRestart] = useState(false);
  const [scannerNeedsPowerCord, setScannerNeedsPowerCord] = useState(false);

  const [hasBeenUnplugged, setHasBeenUnplugged] = useState(false);

  const playError = useSound('error');
  const playSuccess = useSound('success');

  useEffect(() => {
    window.setTimeout(() => {
      setWaitedForChargingConfirmation(true);
    }, 3000);
  }, [setWaitedForChargingConfirmation]);

  useEffect(() => {
    if (
      !scannerNeedsRestart &&
      !scannerNeedsPowerCord &&
      waitedForChargingConfirmation &&
      batteryIsCharging
    ) {
      setScannerNeedsRestart(true);
      playError();
    }
  }, [waitedForChargingConfirmation, setScannerNeedsRestart, playError]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!batteryIsCharging && scannerNeedsRestart) {
      setHasBeenUnplugged(true);
      playSuccess();
    }
  }, [batteryIsCharging, setHasBeenUnplugged, playSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (batteryIsCharging && hasBeenUnplugged) {
      void fetch('/precinct-scanner/scanner/retry', { method: 'POST' });
    }
  }, [batteryIsCharging, hasBeenUnplugged]);

  // just plug the power cord back in
  if (scannerNeedsPowerCord || (!scannerNeedsRestart && !batteryIsCharging)) {
    if (!scannerNeedsPowerCord) {
      setScannerNeedsPowerCord(true);
    }

    return (
      <ScreenMainCenterChild infoBar={false}>
        <CenteredLargeProse>
          <h1>No Power Detected</h1>
          <Text italic>
            Please ask a poll worker to plug in the power cord.
          </Text>
        </CenteredLargeProse>
        {scannedBallotCount !== undefined && (
          <ScannedBallotCount count={scannedBallotCount} />
        )}
      </ScreenMainCenterChild>
    );
  }

  // we need to restart the ploostek
  if (scannerNeedsRestart) {
    // ok they unplugged as directed
    if (hasBeenUnplugged) {
      return (
        <ScreenMainCenterChild infoBar={false}>
          <CenteredLargeProse>
            <h1>Scanner Error</h1>
            <Text italic>OK, now please plug the power cord back in.</Text>
          </CenteredLargeProse>
          {scannedBallotCount !== undefined && (
            <ScannedBallotCount count={scannedBallotCount} />
          )}
        </ScreenMainCenterChild>
      );
    }
    return (
      <ScreenMainCenterChild infoBar={false}>
        <CenteredLargeProse>
          <h1>Scanner Error</h1>
          <Text italic>Ask a poll worker to unplug the power cord.</Text>
        </CenteredLargeProse>
        {scannedBallotCount !== undefined && (
          <ScannedBallotCount count={scannedBallotCount} />
        )}
      </ScreenMainCenterChild>
    );
  }

  // we're not sure yet.
  return (
    <ScreenMainCenterChild infoBar={false}>
      <CenteredLargeProse>
        <h1>Please wait...</h1>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function PowerDisconnectedPreview(): JSX.Element {
  return (
    <SetupScannerScreen batteryIsCharging={false} scannedBallotCount={42} />
  );
}

/* istanbul ignore next */
export function ScannerDisconnectedPreview(): JSX.Element {
  return <SetupScannerScreen batteryIsCharging scannedBallotCount={42} />;
}
