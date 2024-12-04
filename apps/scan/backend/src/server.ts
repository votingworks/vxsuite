import express from 'express';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { LogEventId, Logger } from '@votingworks/logging';
import { UsbDrive, detectUsbDrive } from '@votingworks/usb-drive';
import { detectDevices } from '@votingworks/backend';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { BROTHER_THERMAL_PRINTER_CONFIG } from '@votingworks/printing';
import * as customScanner from '@votingworks/custom-scanner';
import {
  createMockPdiScanner,
  createPdiScannerClient,
} from '@votingworks/pdi-scanner';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { buildApp } from './app';
import { PORT } from './globals';
import { Workspace } from './util/workspace';
import { Printer, getPrinter } from './printing/printer';
import * as customStateMachine from './scanners/custom/state_machine';
import * as pdiStateMachine from './scanners/pdi/state_machine';

export interface StartOptions {
  auth: InsertedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
  port?: number | string;
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
  usbDrive,
  printer,
}: StartOptions): void {
  detectDevices({ logger });
  const resolvedUsbDrive = usbDrive ?? detectUsbDrive(logger);
  const resolvedPrinter = printer ?? getPrinter(logger);

  const mockPdiScanner = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_MOCK_PDI_SCANNER
  )
    ? createMockPdiScanner()
    : undefined;

  const precinctScannerStateMachine = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_CUSTOM_SCANNER
  )
    ? customStateMachine.createPrecinctScannerStateMachine({
        createCustomClient: customScanner.openScanner,
        auth,
        workspace,
        logger,
        usbDrive: resolvedUsbDrive,
      })
    : pdiStateMachine.createPrecinctScannerStateMachine({
        scannerClient: mockPdiScanner?.client ?? createPdiScannerClient(),
        workspace,
        usbDrive: resolvedUsbDrive,
        auth,
        logger,
      });

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

  useDevDockRouter(app, express, {
    printerConfig:
      resolvedPrinter.scheme === 'hardware-v4'
        ? 'fujitsu'
        : BROTHER_THERMAL_PRINTER_CONFIG,
    mockPdiScanner,
  });

  app.listen(PORT, async () => {
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `VxScan backend running at http://localhost:${PORT}/`,
      disposition: 'success',
    });

    await logger.log(LogEventId.WorkspaceConfigurationMessage, 'system', {
      message: `Scanning ballots into ${workspace.ballotImagesPath}`,
    });
  });
}
