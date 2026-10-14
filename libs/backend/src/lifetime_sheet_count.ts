import path from 'node:path';
import {
  getRequiredEnvVar,
  isIntegrationTest,
  isNodeEnvProduction,
} from '@votingworks/utils';
import { readFile } from '@votingworks/fs';
import {
  err,
  extractErrorMessage,
  isNonExistentFileOrDirectoryError,
  ok,
  type Result,
} from '@votingworks/basics';
import { safeParseInt } from '@votingworks/types';
import { type BaseLogger, LogEventId } from '@votingworks/logging';
import { execFile } from './exec.js';
import { intermediateScript } from './intermediate_scripts.js';

function isProductionMachine(): boolean {
  return isNodeEnvProduction() && !isIntegrationTest();
}

/**
 * Gets the location of the lifetime sheet count file: under `VX_CONFIG_ROOT`
 * on production machines, otherwise under `devRoot`.
 */
export function getLifetimeSheetCountFilePath({
  devRoot,
}: {
  devRoot: string;
}): string {
  return path.join(
    isProductionMachine() ? getRequiredEnvVar('VX_CONFIG_ROOT') : devRoot,
    'lifetime-sheet-count'
  );
}

/**
 * Reads the lifetime sheet count file. Returns 0 if it doesn't exist.
 */
export async function readLifetimeSheetCount({
  devRoot,
}: {
  devRoot: string;
}): Promise<Result<number, string>> {
  const lifetimeSheetCountFilePath = getLifetimeSheetCountFilePath({ devRoot });
  const readLifetimeSheetCountFileContentsResult = await readFile(
    lifetimeSheetCountFilePath,
    {
      maxSize: 1024,
      encoding: 'utf8',
    }
  );

  let error: string;

  if (readLifetimeSheetCountFileContentsResult.isErr()) {
    const readError = readLifetimeSheetCountFileContentsResult.err();

    if (
      readError.type === 'OpenFileError' &&
      isNonExistentFileOrDirectoryError(readError.error)
    ) {
      return ok(0);
    }

    error = readError.type;
  } else {
    const contents = readLifetimeSheetCountFileContentsResult.ok().trim();
    const parseLifetimeSheetCountResult = safeParseInt(contents, {
      max: Number.MAX_SAFE_INTEGER,
    });

    if (!/^[0-9]+$/.test(contents)) {
      error = `invalid count: ${JSON.stringify(contents)}`;
    } else if (parseLifetimeSheetCountResult.isErr()) {
      error = parseLifetimeSheetCountResult.err().message;
    } else {
      return parseLifetimeSheetCountResult;
    }
  }

  return err(`Error reading lifetime sheet count: ${error}`);
}

/**
 * Increments the lifetime sheet count on this machine.
 */
export async function incrementLifetimeSheetCount({
  devRoot,
}: {
  devRoot: string;
}): Promise<void> {
  const script = intermediateScript('increment-lifetime-sheet-count');
  const lifetimeSheetCountFilePath = getLifetimeSheetCountFilePath({ devRoot });
  try {
    if (isProductionMachine()) {
      await execFile('sudo', [script, lifetimeSheetCountFilePath]);
    } else {
      await execFile(script, [lifetimeSheetCountFilePath]);
    }
  } catch (error) {
    if ('stderr' in (error as Error)) {
      throw new Error((error as { stderr: string }).stderr);
    } else {
      throw error;
    }
  }
}

/** Reads and increments the lifetime sheet count, caching it in memory. */
export interface LifetimeSheetCounter {
  /** Returns the count, or 0 if it can't be read. */
  get(): Promise<number>;

  /** Increments the count, logging any failure. */
  increment(): Promise<void>;
}

/**
 * Creates a {@link LifetimeSheetCounter}. Each distinct read error is logged
 * once.
 */
export function createLifetimeSheetCounter({
  devRoot,
  logger,
}: {
  devRoot: string;
  logger: BaseLogger;
}): LifetimeSheetCounter {
  let cachedCount: number | undefined;
  let pendingIncrements = 0;
  let incrementEvents = 0;

  async function get(): Promise<number> {
    if (cachedCount !== undefined) {
      return cachedCount;
    }

    const incrementEventsBeforeRead = incrementEvents;
    const result = await readLifetimeSheetCount({ devRoot });
    const error = result.err();
    if (error !== undefined) {
      logger.log(LogEventId.LifetimeSheetCountReadError, 'system', {
        disposition: 'failure',
        message: error,
      });
    }

    // A read that overlaps an increment may see the file before or after it.
    if (
      result.isOk() &&
      pendingIncrements === 0 &&
      incrementEvents === incrementEventsBeforeRead
    ) {
      cachedCount = result.ok();
    }
    return result.ok() ?? 0;
  }

  async function increment(): Promise<void> {
    pendingIncrements += 1;
    incrementEvents += 1;
    if (cachedCount !== undefined) {
      cachedCount += 1;
    }

    try {
      await incrementLifetimeSheetCount({ devRoot });
    } catch (error) {
      cachedCount = undefined;
      logger.log(LogEventId.LifetimeSheetCountIncrementError, 'system', {
        disposition: 'failure',
        message: 'Unable to increment lifetime sheet count.',
        errorDetails: extractErrorMessage(error),
      });
    } finally {
      pendingIncrements -= 1;
      incrementEvents += 1;
    }
  }

  return { get, increment };
}
