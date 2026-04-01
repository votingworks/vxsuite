import { Card } from '@votingworks/auth';
import { CardReaderErrorTracker, TaskController } from '@votingworks/backend';
import { Logger } from '@votingworks/logging';
import { UsbDrive } from '@votingworks/usb-drive';
import { DateTime } from 'luxon';
import { FujitsuThermalPrinterInterface } from '@votingworks/fujitsu-thermal-printer';
import { Workspace } from '../util/workspace';
import { ScanningSession } from './analysis/scan';
import { SimpleScannerClient } from './simple_scanner_client';

export type ScanningMode =
  | 'shoe-shine'
  | 'manual-front'
  | 'manual-rear'
  | 'disabled';

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
