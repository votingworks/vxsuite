import type { DippedSmartCardAuthApi } from '@votingworks/auth';
import type { Logger } from '@votingworks/logging';
import type { UsbDrive } from '@votingworks/usb-drive';
import type { Printer } from '@votingworks/printing';
import type { Workspace } from './util/workspace.js';

export interface AppContext {
  auth: DippedSmartCardAuthApi;
  usbDrive: UsbDrive;
  logger: Logger;
  workspace: Workspace;
  printer: Printer;
}
