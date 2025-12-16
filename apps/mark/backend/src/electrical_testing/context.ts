import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { TaskController } from '@votingworks/backend';
import { Logger } from '@votingworks/logging';
import { UsbDrive } from '@votingworks/usb-drive';
import { Printer } from '@votingworks/printing';
import { Workspace } from '../util/workspace';
import * as barcodes from '../barcodes';
import { Player as AudioPlayer } from '../audio/player';

export interface ServerContext {
  audioPlayer?: AudioPlayer;
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
