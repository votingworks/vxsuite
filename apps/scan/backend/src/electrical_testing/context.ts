import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { Logger } from '@votingworks/logging';
import { UsbDrive } from '@votingworks/usb-drive';

import { Printer } from '../printing/printer';
import { Workspace } from '../util/workspace';
import { SimpleScannerClient } from './simple_scanner_client';

export interface ServerContext {
  auth: InsertedSmartCardAuthApi;
  logger: Logger;
  printer: Printer;
  usbDrive: UsbDrive;
  workspace: Workspace;
  scannerClient: SimpleScannerClient;
  controller: AbortController;
}
