import type { Card } from '@votingworks/auth';
import type {
  CardReaderErrorTracker,
  TaskController,
} from '@votingworks/backend';
import type { Logger } from '@votingworks/logging';
import type { UsbDrive } from '@votingworks/usb-drive';
import type { DateTime } from 'luxon';
import type { FujitsuThermalPrinterInterface } from '@votingworks/fujitsu-thermal-printer';
import type { Workspace } from '../util/workspace.js';
import type { ScanningSession } from './analysis/scan.js';
import type { SimpleScannerClient } from './simple_scanner_client.js';

export type ScanningMode =
  'shoe-shine' | 'manual-front' | 'manual-rear' | 'disabled';

export interface ServerContext {
  card: Card;
  cardReaderErrorTracker: CardReaderErrorTracker;
  cardTask: TaskController<void, string>;
  usbDriveTask: TaskController<void, string>;
  printerTask: TaskController<{ lastPrintedAt?: DateTime }, string>;
  scannerTask: TaskController<
    { mode: ScanningMode; session: ScanningSession },
    string
  >;
  logger: Logger;
  printer: FujitsuThermalPrinterInterface;
  scannerClient: SimpleScannerClient;
  usbDrive: UsbDrive;
  workspace: Workspace;
}
