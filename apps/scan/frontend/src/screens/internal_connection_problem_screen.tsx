import {
  CenteredLargeProse,
  H1,
  P,
  PowerDownButton,
  appStrings,
} from '@votingworks/ui';
import { PrinterStatus } from '@votingworks/scan-backend';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { ScreenMainCenterChild } from '../components/layout';
import { LiveCheckButton } from '../components/live_check_button';

function PrinterErrorMessage({
  printerStatus,
}: {
  printerStatus: PrinterStatus;
}): JSX.Element | null {
  /* istanbul ignore next - unreachable safety check */
  if (printerStatus.scheme === 'hardware-v3') {
    return null;
  }
  /* istanbul ignore next - unreachable safety check */
  if (printerStatus.state !== 'error') {
    return null;
  }
  return printerStatus.type === 'disconnected'
    ? appStrings.notePrinterDisconnected()
    : appStrings.notePrinterHardwareError();
}
interface Props {
  scannedBallotCount?: number;
  printerStatus: PrinterStatus;
  isScannerConnected: boolean;
  isPollWorkerAuth: boolean;
}

export function InternalConnectionProblemScreen({
  scannedBallotCount,
  printerStatus,
  isScannerConnected,
  isPollWorkerAuth,
}: Props): JSX.Element {
  // Only support v4 hardware for showing connection status errors.
  const isPrinterConnected = !(
    printerStatus.scheme === 'hardware-v4' && printerStatus.state === 'error'
  );
  const pollWorkerActions = (
    <P>
      <PowerDownButton variant="primary" />{' '}
      {isFeatureFlagEnabled(BooleanEnvironmentVariableName.LIVECHECK) && (
        <LiveCheckButton />
      )}
    </P>
  );
  return (
    <ScreenMainCenterChild ballotCountOverride={scannedBallotCount} voterFacing>
      <CenteredLargeProse>
        <H1>{appStrings.titleInternalConnectionProblem()}</H1>
        {!isScannerConnected && <P>{appStrings.noteScannerDisconnected()}</P>}
        {!isPrinterConnected && (
          <P>
            <PrinterErrorMessage printerStatus={printerStatus} />
          </P>
        )}
        <P>
          {isPollWorkerAuth
            ? pollWorkerActions
            : appStrings.instructionsAskForHelp()}
        </P>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function PrinterDisconnectedPreview(): JSX.Element {
  return (
    <InternalConnectionProblemScreen
      isPollWorkerAuth={false}
      isScannerConnected
      printerStatus={{
        scheme: 'hardware-v4',
        state: 'error',
        type: 'disconnected',
      }}
      scannedBallotCount={42}
    />
  );
}

export function PrinterHardwareErrorPreview(): JSX.Element {
  return (
    <InternalConnectionProblemScreen
      isPollWorkerAuth={false}
      isScannerConnected
      printerStatus={{
        scheme: 'hardware-v4',
        state: 'error',
        type: 'receive-data',
      }}
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function ScannerDisconnectedPreview(): JSX.Element {
  return (
    <InternalConnectionProblemScreen
      isPollWorkerAuth={false}
      isScannerConnected={false}
      printerStatus={{ scheme: 'hardware-v4', state: 'idle' }}
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function ScannerDisconnectedPollWorkerPreview(): JSX.Element {
  return (
    <InternalConnectionProblemScreen
      isPollWorkerAuth
      isScannerConnected={false}
      printerStatus={{ scheme: 'hardware-v4', state: 'idle' }}
      scannedBallotCount={42}
    />
  );
}

/* istanbul ignore next */
export function PrinterScannerDisconnectedPreview(): JSX.Element {
  return (
    <InternalConnectionProblemScreen
      isPollWorkerAuth={false}
      isScannerConnected={false}
      printerStatus={{
        scheme: 'hardware-v4',
        state: 'error',
        type: 'disconnected',
      }}
      scannedBallotCount={42}
    />
  );
}
