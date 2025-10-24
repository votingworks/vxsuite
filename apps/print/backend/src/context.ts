import { DippedSmartCardAuthApi } from '@votingworks/auth';
import { Logger } from '@votingworks/logging';
import { UsbDrive } from '@votingworks/usb-drive';
import { Printer } from '@votingworks/printing';
import { Workspace } from './util/workspace';

export interface AppContext {
  auth: DippedSmartCardAuthApi;
  usbDrive: UsbDrive;
  logger: Logger;
  workspace: Workspace;
  printer: Printer;
}
