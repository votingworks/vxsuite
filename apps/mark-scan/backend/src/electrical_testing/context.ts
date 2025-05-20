import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { TaskController } from '@votingworks/backend';
import { Logger } from '@votingworks/logging';
import { UsbDrive } from '@votingworks/usb-drive';
import { Workspace } from '../util/workspace';

export interface ServerContext {
  auth: InsertedSmartCardAuthApi;
  cardTask: TaskController<string>;
  paperHandlerTask: TaskController<string>;
  usbDriveTask: TaskController<string>;
  logger: Logger;
  usbDrive: UsbDrive;
  workspace: Workspace;
}
