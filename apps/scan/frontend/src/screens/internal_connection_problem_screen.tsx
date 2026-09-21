import { H1, P, PowerDownButton, appStrings } from '@votingworks/ui';
import type { PrinterStatus } from '@votingworks/fujitsu-thermal-printer';
import { CenteredText, ScreenMainCenterChild } from '../components/layout.js';

function PrinterErrorMessage({
  printerStatus,
}: {
  printerStatus: PrinterStatus;
}): JSX.Element | null {
  // @coverage-exclude: unreachable safety check
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
