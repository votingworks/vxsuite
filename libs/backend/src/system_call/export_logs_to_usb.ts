import {
  Result,
  deferred,
  err,
  extractErrorMessage,
  ok,
  throwIllegalValue,
} from '@votingworks/basics';
import { UsbDrive } from '@votingworks/usb-drive';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';

import {
  LogEventId,
  LogExportFormat,
  Logger,
  filterErrorLogs,
} from '@votingworks/logging';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { dirSync } from 'tmp';
import { generateFileTimeSuffix } from '@votingworks/utils';
import { convertVxLogToCdf } from '@votingworks/logging-utils';
import { execFile } from '../exec';

const LOG_DIR = '/var/log/votingworks';
const COMPRESSED_VX_LOGS_NAME_REGEX = 'vx-logs.log-[0-9]*.gz';

/** type of return value from exporting logs */
export type LogsExportError =
  | { code: 'no-logs-directory' }
  | { code: 'no-usb-drive' }
  | { code: 'copy-failed'; cause: unknown }
  | { code: 'cdf-conversion-failed'; cause: unknown }
  | { code: 'error-filtering-failed'; cause: unknown };

/** type of return value from exporting logs */
export type LogsResultType = Result<void, LogsExportError>;

function convertFileToCdf(
  logger: Logger,
  inputPath: string,
  outputPath: string,
  machineId: string,
  codeVersion: string,
  compressed: boolean
): Promise<void> {
  const { promise, reject, resolve } = deferred<void>();

  convertVxLogToCdf(
    (eventId, message, disposition) => {
      void logger.logAsCurrentRole(eventId, { message, disposition });
    },
    logger.getSource(),
    machineId,
    codeVersion,
    inputPath,
    outputPath,
    compressed,
    (error) => (error ? reject(error) : resolve())
  );

  return promise;
}

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
    const compressed = false;
    await convertFileToCdf(
      logger,
      join(logDir, 'vx-logs.log'),
      join(outputDir, 'vx-logs.cdf.log.json'),
      machineId,
      codeVersion,
      compressed
    );
  }

  // Create CDF for all compressed vx-logs files
  for (const file of files) {
    if (file.match(COMPRESSED_VX_LOGS_NAME_REGEX)) {
      const cdfFileName = file.replace('vx-logs', 'vx-logs.cdf.json');
      const compressed = true;
      await convertFileToCdf(
        logger,
        join(logDir, file),
        join(outputDir, cdfFileName),
        machineId,
        codeVersion,
        compressed
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
    return err({ code: 'no-logs-directory' });
  }

  const status = await usbDrive.status();
  if (status.status !== 'mounted') {
    return err({ code: 'no-usb-drive' });
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
      } catch (cause) {
        await fs.rm(tempDirectory, { recursive: true });
        return err({ code: 'cdf-conversion-failed', cause });
      }
      break;
    case 'err':
      try {
        await filterLogsToErrors(LOG_DIR, tempDirectory);
      } catch (cause) {
        await fs.rm(tempDirectory, { recursive: true });
        return err({ code: 'error-filtering-failed', cause });
      }
      break;
    /* istanbul ignore next - compile time check @preserve */
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
      /* istanbul ignore next - compile time check @preserve */
      default:
        throwIllegalValue(format);
    }
    await usbDrive.sync();
  } catch (cause) {
    return err({ code: 'copy-failed', cause });
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

  if (result.isErr()) {
    const error = result.err();

    let cause: string | undefined;
    if ('cause' in error) {
      if (error.cause instanceof Error) {
        cause = error.cause.stack || extractErrorMessage(error.cause);
      } else {
        cause = extractErrorMessage(error.cause);
      }
    }

    await logger.logAsCurrentRole(LogEventId.FileSaved, {
      disposition: 'failure',
      message: `Failed to save logs to usb drive: ${error.code}`,
      fileType: 'logs',
      cause,
    });

    return result;
  }

  await logger.logAsCurrentRole(LogEventId.FileSaved, {
    disposition: 'success',
    message: 'Successfully saved logs on the usb drive.',
    fileType: 'logs',
  });

  return result;
}
