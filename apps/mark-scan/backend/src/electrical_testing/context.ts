import type { Card } from '@votingworks/auth';
import type {
  CardReaderErrorTracker,
  TaskController,
} from '@votingworks/backend';
import type { Logger } from '@votingworks/logging';
import type { UsbDrive } from '@votingworks/usb-drive';
import type { Workspace } from '../util/workspace.js';

export interface ServerContext {
  card: Card;
  cardReaderErrorTracker: CardReaderErrorTracker;
  cardTask: TaskController<void, string>;
  paperHandlerTask: TaskController<void, string>;
  usbDriveTask: TaskController<void, string>;
  logger: Logger;
  usbDrive: UsbDrive;
  workspace: Workspace;
}
