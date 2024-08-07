import { CenteredLargeProse, H1, P, appStrings } from '@votingworks/ui';
import { PrinterStatus } from '@votingworks/scan-backend';
import { throwIllegalValue } from '@votingworks/basics';
import { ScreenMainCenterChild } from '../components/layout';

function PrinterErrorMessage({
  printerStatus,
}: {
  printerStatus: PrinterStatus;
}): JSX.Element | null {
  if (printerStatus.scheme === 'hardware-v3') {
    return null;
  }
  if (printerStatus.state !== 'error') {
    return null;
  }
  switch (printerStatus.type) {
    case 'disconnected':
      return appStrings.notePrinterDisconnected();
    case 'hardware':
      return appStrings.notePrinterHardwareError();
    case 'supply-voltage':
      return appStrings.notePrinterSupplyVoltageError();
    case 'temperature':
      return appStrings.notePrinterTemperatureError();
    case 'receive-data':
      return appStrings.notePrinterReceiveDataError();
    default:
      throwIllegalValue(printerStatus.type);
  }
}
interface Props {
  scannedBallotCount?: number;
  printerStatus: PrinterStatus;
  isScannerConnected: boolean;
}

export function InternalConnectionProblemScreen({
  scannedBallotCount,
  printerStatus,
  isScannerConnected,
}: Props): JSX.Element {
  // Only support v4 hardware for showing connection status errors.
  const isPrinterConnected = !(
    printerStatus.scheme === 'hardware-v4' && printerStatus.state === 'error'
  );
  return (
    <ScreenMainCenterChild ballotCountOverride={scannedBallotCount} voterFacing>
      <CenteredLargeProse>
        <H1>{appStrings.titleInternalConnectionProblem()}</H1>
        <P>
          {!isScannerConnected && appStrings.noteScannerDisconnected()}
          {!isPrinterConnected && (
            <PrinterErrorMessage printerStatus={printerStatus} />
          )}
        </P>
        <P>{appStrings.instructionsAskForHelp()}</P>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
/* export function PowerDisconnectedPreview(): JSX.Element {
  return (
    <SetupScannerScreen batteryIsCharging={false} scannedBallotCount={42} />
  );
}
*/
/* istanbul ignore next */
/* export function ScannerDisconnectedPreview(): JSX.Element {
  return <SetupScannerScreen batteryIsCharging scannedBallotCount={42} />;
}
*/
