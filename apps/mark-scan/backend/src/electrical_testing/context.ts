import { Card } from '@votingworks/auth';
import { CardReaderErrorTracker, TaskController } from '@votingworks/backend';
import { Logger } from '@votingworks/logging';
import { UsbDrive } from '@votingworks/usb-drive';
import { Workspace } from '../util/workspace';

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
