import { H1, P, PowerDownButton, appStrings } from '@votingworks/ui';
import type { PrinterStatus } from '@votingworks/fujitsu-thermal-printer';
import { CenteredText, ScreenMainCenterChild } from '../components/layout.js';

function PrinterErrorMessage({
  printerStatus,
}: {
  printerStatus: PrinterStatus;
}): JSX.Element | null {
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
  const isPrinterConnectedSuccessfully = printerStatus.state !== 'error';
  return (
    <ScreenMainCenterChild
      ballotCountOverride={scannedBallotCount}
      voterFacing
      showTestModeBanner={false}
    >
      <CenteredText>
        <H1>{appStrings.titleInternalConnectionProblem()}</H1>
        {!isScannerConnected && <P>{appStrings.noteScannerDisconnected()}</P>}
        {!isPrinterConnectedSuccessfully && (
          <P>
            <PrinterErrorMessage printerStatus={printerStatus} />
          </P>
        )}
        <P as="div">
          {isPollWorkerAuth ? (
            <P>
              <PowerDownButton variant="primary" />
            </P>
          ) : (
            appStrings.instructionsAskForHelp()
          )}
        </P>
      </CenteredText>
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
      printerStatus={{ state: 'idle' }}
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
      printerStatus={{ state: 'idle' }}
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
        state: 'error',
        type: 'disconnected',
      }}
      scannedBallotCount={42}
    />
  );
}
