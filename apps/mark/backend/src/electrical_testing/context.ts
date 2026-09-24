import type { Card } from '@votingworks/auth';
import type {
  BarcodeReaderErrorTracker,
  CardReaderErrorTracker,
  ExternalPrinterErrorTracker,
  TaskController,
} from '@votingworks/backend';
import type { Logger } from '@votingworks/logging';
import type { UsbDrive } from '@votingworks/usb-drive';
import type { Printer } from '@votingworks/printing';
import type { Workspace } from '../util/workspace.js';
import type * as barcodes from '../barcodes/index.js';
import type { Player as AudioPlayer } from '../audio/player.js';

export interface ServerContext {
  audioPlayer?: AudioPlayer;
  card: Card;
  barcodeReaderErrorTracker: BarcodeReaderErrorTracker;
  cardReaderErrorTracker: CardReaderErrorTracker;
  externalPrinterErrorTracker: ExternalPrinterErrorTracker;
  cardTask: TaskController<void, string>;
  usbDriveTask: TaskController<void, string>;
  printerTask: TaskController<void, string>;
  logger: Logger;
  usbDrive: UsbDrive;
  workspace: Workspace;
  printer: Printer;
  barcodeClient?: barcodes.BarcodeReader;
}
