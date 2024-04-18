import { Result, err, ok } from '@votingworks/basics';
import { UsbDrive } from '@votingworks/usb-drive';
import * as fs from 'fs/promises';
import { join } from 'path';

import { LogEventId, Logger } from '@votingworks/logging';
import { execFile } from '../exec';

const LOG_DIR = '/var/log/votingworks';

/** type of return value from exporting logs */
export type LogsResultType = Result<
  void,
  'no-logs-directory' | 'no-usb-drive' | 'copy-failed'
>;

/**
 * Copies the logs directory to a USB drive, does not log the action.
 */
async function exportLogsToUsbHelper({
  usbDrive,
  machineId,
}: {
  usbDrive: UsbDrive;
  machineId: string;
}): Promise<LogsResultType> {
  let logDirPathExistsAndIsDirectory = false;
  try {
    const sourceStatus = await fs.stat(LOG_DIR);
    logDirPathExistsAndIsDirectory = sourceStatus.isDirectory();
  } catch (e) {
    // ignore
  }

  if (!logDirPathExistsAndIsDirectory) {
    return err('no-logs-directory');
  }

  const status = await usbDrive.status();
  if (status.status !== 'mounted') {
    return err('no-usb-drive');
  }

  const machineNamePath = join(status.mountPoint, `/logs/machine_${machineId}`);

  const dateString = new Date().toISOString().replaceAll(':', '-');
  const destinationDirectory = join(machineNamePath, dateString);

  try {
    await execFile('mkdir', ['-p', machineNamePath]);
    await execFile('cp', ['-r', LOG_DIR, destinationDirectory]);
    await execFile('sync', [status.mountPoint]);
  } catch {
    return err('copy-failed');
  }

  return ok();
}

/**
 * Copies the logs directory to a USB drive and logs the action.
 */
export async function exportLogsToUsb({
  usbDrive,
  machineId,
  logger,
}: {
  usbDrive: UsbDrive;
  machineId: string;
  logger: Logger;
}): Promise<LogsResultType> {
  const result = await exportLogsToUsbHelper({ usbDrive, machineId });

  await logger.logAsCurrentRole(LogEventId.FileSaved, {
    disposition: result.isOk() ? 'success' : 'failure',
    message: result.isOk()
      ? 'Sucessfully saved logs on the usb drive.'
      : `Failed to save logs to usb drive: ${result.err()}`,
    fileType: 'logs',
  });

  return result;
}
