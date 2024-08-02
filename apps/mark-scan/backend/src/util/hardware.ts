import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { join } from 'path';
import { readFile } from '@votingworks/fs';
import { safeParseInt } from '@votingworks/types';
import { LogEventId, Logger } from '@votingworks/logging';
import { BmdModelNumber } from '../types';

export const PID_FILENAME = 'vx_accessible_controller_daemon.pid';
const MAX_FILE_SIZE_BYTES = 50 * 1024;

export function getMarkScanBmdModel(): BmdModelNumber {
  return isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.MARK_SCAN_USE_BMD_150
  )
    ? 'bmd-150'
    : 'bmd-155';
}

export async function isAccessibleControllerDaemonRunning(
  workspacePath: string,
  logger: Logger
): Promise<boolean> {
  const readResult = await readFile(join(workspacePath, PID_FILENAME), {
    maxSize: MAX_FILE_SIZE_BYTES,
    encoding: 'utf-8',
  });

  if (readResult.isErr()) {
    await logger.log(LogEventId.NoPid, 'system', {
      message: 'Unable to read accessible controller daemon PID file',
      error: JSON.stringify(readResult.err()),
    });
    return false;
  }

  const pidString = readResult.ok();
  const pidResult = safeParseInt(pidString);
  if (pidResult.isErr()) {
    await logger.log(LogEventId.ParseError, 'system', {
      message: `Unable to parse accessible controller daemon PID: ${pidString}`,
    });
    return false;
  }

  const pid = pidResult.ok();

  try {
    // Check if the process is running by sending signal 0
    process.kill(pid, 0);
    return true;
  } catch (error) {
    switch ((error as NodeJS.ErrnoException).code) {
      case 'ESRCH':
        await logger.log(LogEventId.NoPid, 'system', {
          message: `Process with PID ${pid} is not running`,
        });
        return false;
      case 'EPERM':
        await logger.log(LogEventId.PermissionDenied, 'system', {
          message: 'Permission denied to check PID',
        });
        return false;
      default:
        await logger.log(LogEventId.UnknownError, 'system', {
          message: 'Unknown error when checking PID',
          error: JSON.stringify(error),
        });
        return false;
    }
  }
}
