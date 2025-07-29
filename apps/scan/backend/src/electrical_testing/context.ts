import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { TaskController } from '@votingworks/backend';
import { Logger } from '@votingworks/logging';
import { UsbDrive } from '@votingworks/usb-drive';
import { Printer } from '../printing/printer';
import { Workspace } from '../util/workspace';
import { SimpleScannerClient } from './simple_scanner_client';
import { DateTime } from 'luxon';

export type ScanningMode =
  | 'shoe-shine'
  | 'manual-front'
  | 'manual-rear'
  | 'disabled';

export interface ServerContext {
  auth: InsertedSmartCardAuthApi;
  cardTask: TaskController<void, string>;
  usbDriveTask: TaskController<void, string>;
  printerTask: TaskController<{ lastPrintedAt?: DateTime }, string>;
  scannerTask: TaskController<{ mode: ScanningMode }, string>;
  logger: Logger;
  printer: Printer;
  scannerClient: SimpleScannerClient;
  usbDrive: UsbDrive;
  workspace: Workspace;
}
