import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { LogEventId, Logger } from '@votingworks/logging';
import { UsbDrive, detectUsbDrive } from '@votingworks/usb-drive';
import { Printer, detectPrinter } from '@votingworks/printing';
import { detectDevices } from '@votingworks/backend';
import { buildApp } from './app';
import { PORT } from './globals';
import { PrecinctScannerStateMachine } from './types';
import { Workspace } from './util/workspace';

export interface StartOptions {
  auth: InsertedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
  port?: number | string;
  precinctScannerStateMachine: PrecinctScannerStateMachine;
  usbDrive?: UsbDrive;
  printer?: Printer;
}

/**
 * Starts the server.
 */
export function start({
  auth,
  workspace,
  logger,
  precinctScannerStateMachine,
  usbDrive,
  printer,
}: StartOptions): void {
  detectDevices({ logger });
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
