import { err, ok } from '@votingworks/basics';
import { UsbDrive } from '@votingworks/usb-drive';
import * as fs from 'fs/promises';
import { join } from 'path';

import { LogsResultType } from '@votingworks/types';
import { execFile } from '../exec';

const LOG_DIR = '/var/log/votingworks';

/**
 * Copies the logs directory to a USB drive.
 */
export async function exportLogsToUsb({
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
  } catch {
    return err('copy-failed');
  }

  return ok();
}
