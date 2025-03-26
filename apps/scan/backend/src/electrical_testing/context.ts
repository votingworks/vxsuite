import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { Logger } from '@votingworks/logging';
import { UsbDrive } from '@votingworks/usb-drive';

import { Printer } from '../printing/printer';
import { Workspace } from '../util/workspace';
import { SimpleScannerClient } from './simple_scanner_client';
import { TaskController } from './task_controller';

export interface ServerContext {
  auth: InsertedSmartCardAuthApi;
  cardTask: TaskController<string>;
  usbDriveTask: TaskController<string>;
  printerTask: TaskController<string>;
  scannerTask: TaskController<string>;
  logger: Logger;
  printer: Printer;
  scannerClient: SimpleScannerClient;
  usbDrive: UsbDrive;
  workspace: Workspace;
}
