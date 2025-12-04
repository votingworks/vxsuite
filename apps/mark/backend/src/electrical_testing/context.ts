/* istanbul ignore file - @preserve */
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { TaskController } from '@votingworks/backend';
import { Logger } from '@votingworks/logging';
import { UsbDrive } from '@votingworks/usb-drive';
import { Printer } from '@votingworks/printing';
import { Workspace } from '../util/workspace';
import * as barcodes from '../barcodes';

export interface ServerContext {
  auth: InsertedSmartCardAuthApi;
  cardTask: TaskController<void, string>;
  usbDriveTask: TaskController<void, string>;
  printerTask: TaskController<void, string>;
  logger: Logger;
  usbDrive: UsbDrive;
  workspace: Workspace;
  printer: Printer;
  barcodeClient?: barcodes.Client;
}
