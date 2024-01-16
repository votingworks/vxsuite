import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { LogEventId, LogSource, Logger } from '@votingworks/logging';
import { UsbDrive, detectUsbDrive } from '@votingworks/usb-drive';
import { Printer, detectPrinter } from '@votingworks/printing';
import { buildApp } from './app';
import { PORT } from './globals';
import { PrecinctScannerStateMachine } from './types';
import { Workspace } from './util/workspace';

export interface StartOptions {
  auth: InsertedSmartCardAuthApi;
  logger?: Logger;
  port?: number | string;
  precinctScannerStateMachine: PrecinctScannerStateMachine;
  usbDrive?: UsbDrive;
  printer?: Printer;
  workspace: Workspace;
}

/**
 * Starts the server.
 */
export function start({
  auth,
  logger = new Logger(LogSource.VxScanBackend),
  precinctScannerStateMachine,
  usbDrive,
  printer,
  workspace,
}: StartOptions): void {
  const resolvedUsbDrive = usbDrive ?? detectUsbDrive(logger);
  const resolvedPrinter = printer ?? detectPrinter(logger);

  // Clear any cached data
  workspace.clearUploads();

  const app = buildApp({
    auth,
    machine: precinctScannerStateMachine,
    workspace,
    usbDrive: resolvedUsbDrive,
    printer: resolvedPrinter,
    logger,
  });

  app.listen(PORT, async () => {
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `VxScan backend running at http://localhost:${PORT}/`,
      disposition: 'success',
    });

    await logger.log(LogEventId.ScanServiceConfigurationMessage, 'system', {
      message: `Scanning ballots into ${workspace.ballotImagesPath}`,
    });
  });
}
