import { DippedSmartCardAuthApi } from '@votingworks/auth';
import { Logger } from '@votingworks/logging';
import { UsbDrive } from '@votingworks/usb-drive';
import { Workspace } from './util/workspace';

export interface AppContext {
  auth: DippedSmartCardAuthApi;
  usbDrive: UsbDrive;
  logger: Logger;
  workspace: Workspace;
}
