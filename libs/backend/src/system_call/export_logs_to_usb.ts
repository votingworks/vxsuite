import { Result, err, ok, throwIllegalValue } from '@votingworks/basics';
import { UsbDrive } from '@votingworks/usb-drive';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';

import {
  LogEventId,
  LogExportFormat,
  Logger,
  buildCdfLog,
  filterErrorLogs,
} from '@votingworks/logging';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { dirSync } from 'tmp';
import { generateFileTimeSuffix } from '@votingworks/utils';
import { execFile } from '../exec';

const LOG_DIR = '/var/log/votingworks';
const COMPRESSED_VX_LOGS_NAME_REGEX = 'vx-logs.log-[0-9]*.gz';

/** type of return value from exporting logs */
export type LogsResultType = Result<
  void,
  | 'no-logs-directory'
  | 'no-usb-drive'
  | 'copy-failed'
  | 'cdf-conversion-failed'
  | 'error-filtering-failed'
>;

async function convertLogsToCdf(
  logDir: string,
  outputDir: string,
  logger: Logger,
  machineId: string,
  codeVersion: string
): Promise<void> {
  const files = await fs.readdir(logDir);

  // Create CDF for vx-logs.log
  if (files.includes('vx-logs.log')) {
    await pipeline(
      createReadStream(join(logDir, 'vx-logs.log'), 'utf8'),
      (inputStream: AsyncIterable<string>) =>
        buildCdfLog(logger, inputStream, machineId, codeVersion),
      createWriteStream(join(outputDir, 'vx-logs.cdf.log.json'))
    );
  }

  // Create CDF for all compressed vx-logs files
  for (const file of files) {
    if (file.match(COMPRESSED_VX_LOGS_NAME_REGEX)) {
      const cdfFileName = file.replace('vx-logs', 'vx-logs.cdf.json');
      await pipeline(
        createReadStream(join(logDir, file)),
        createGunzip(),
        (inputStream: AsyncIterable<string>) =>
          buildCdfLog(logger, inputStream, machineId, codeVersion),
        createGzip(),
        createWriteStream(join(outputDir, cdfFileName))
      );
    }
  }
}

async function filterLogsToErrors(
  logDir: string,
  outputDir: string
): Promise<void> {
  const files = await fs.readdir(logDir);

  // Create errors only version of current vx-logs file
  if (files.includes('vx-logs.log')) {
    await pipeline(
      createReadStream(join(logDir, 'vx-logs.log'), 'utf8'),
      filterErrorLogs,
      createWriteStream(join(outputDir, 'vx-logs.errors.log'))
    );
  }

  // Create errors only versions of all compressed vx-logs files
  for (const file of files) {
    if (file.match(COMPRESSED_VX_LOGS_NAME_REGEX)) {
      const errorFileName = file.replace('vx-logs', 'vx-logs.errors');
      await pipeline(
        createReadStream(join(logDir, file)),
        createGunzip(),
        filterErrorLogs,
        createGzip(),
        createWriteStream(join(outputDir, errorFileName))
      );
    }
  }
}

/**
 * Copies the logs directory to a USB drive, does not log the action.
 */
async function exportLogsToUsbHelper({
  usbDrive,
  format,
  machineId,
  codeVersion,
  logger,
}: {
  usbDrive: UsbDrive;
  format: LogExportFormat;
  machineId: string;
  codeVersion: string;
  logger: Logger;
}): Promise<LogsResultType> {
  let logDirPathExistsAndIsDirectory = false;
  try {
    const sourceStatus = await fs.stat(LOG_DIR);
    logDirPathExistsAndIsDirectory = sourceStatus.isDirectory();
  } catch {
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

  const destinationDirectory = join(machineNamePath, generateFileTimeSuffix());
  const tempDirectory = dirSync().name;

  switch (format) {
    case 'vxf':
      break;
    case 'cdf':
      try {
        await convertLogsToCdf(
          LOG_DIR,
          tempDirectory,
          logger,
          machineId,
          codeVersion
        );
      } catch {
        await fs.rm(tempDirectory, { recursive: true });
        return err('cdf-conversion-failed');
      }
      break;
    case 'err':
      try {
        await filterLogsToErrors(LOG_DIR, tempDirectory);
      } catch {
        await fs.rm(tempDirectory, { recursive: true });
        return err('error-filtering-failed');
      }
      break;
    /* istanbul ignore next - compile time check */
    default:
      throwIllegalValue(format);
  }

  try {
    await execFile('mkdir', ['-p', machineNamePath]);
    switch (format) {
      case 'vxf':
        await execFile('cp', ['-r', LOG_DIR, destinationDirectory]);
        break;
      case 'cdf':
      case 'err':
        await execFile('cp', ['-r', tempDirectory, destinationDirectory]);
        break;
      /* istanbul ignore next - compile time check */
      default:
        throwIllegalValue(format);
    }
    await usbDrive.sync();
  } catch {
    return err('copy-failed');
  } finally {
    if (format === 'cdf' || format === 'err') {
      await fs.rm(tempDirectory, { recursive: true });
    }
  }

  return ok();
}

/**
 * Copies the logs directory to a USB drive and logs the action.
 */
export async function exportLogsToUsb({
  usbDrive,
  machineId,
  codeVersion,
  format,
  logger,
}: {
  usbDrive: UsbDrive;
  machineId: string;
  codeVersion: string;
  format: LogExportFormat;
  logger: Logger;
}): Promise<LogsResultType> {
  const result = await exportLogsToUsbHelper({
    usbDrive,
    format,
    machineId,
    codeVersion,
    logger,
  });

  await logger.logAsCurrentRole(LogEventId.FileSaved, {
    disposition: result.isOk() ? 'success' : 'failure',
    message: result.isOk()
      ? 'Successfully saved logs on the usb drive.'
      : `Failed to save logs to usb drive: ${result.err()}`,
    fileType: 'logs',
  });

  return result;
}
