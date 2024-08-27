import { Result, err } from '@votingworks/basics';
import { readFile, ReadFileError } from '@votingworks/fs';
import { LogEventId, Logger } from '@votingworks/logging';
import { safeParseJson, ResultsReporting } from '@votingworks/types';
import z from 'zod';

const MAX_ERR_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Attempts to read and parse an Election Results Reporting file at the specified filepath.
 * Returns a Result with an ElectionReport if successful or an error if unsucessful.
 * @param filepath The path to the ERR file to parse
 * @returns Promise resolving a Result with either the ElectionReport or an error
 */
export async function parseElectionResultsReportingFile(
  filepath: string,
  logger: Logger
): Promise<
  Result<
    ResultsReporting.ElectionReport,
    z.ZodError | SyntaxError | ReadFileError
  >
> {
  const readFileResult = await readFile(filepath, {
    maxSize: MAX_ERR_FILE_SIZE_BYTES,
  });

  if (readFileResult.isErr()) {
    await logger.logAsCurrentRole(LogEventId.FileReadError, {
      message: `An error occurred when reading ERR file: ${JSON.stringify(
        readFileResult.err()
      )}`,
    });
    return err(readFileResult.err());
  }

  const fileData = readFileResult.ok();

  const fileContentsString = fileData.toString('utf-8');
  return safeParseJson(
    fileContentsString,
    ResultsReporting.ElectionReportSchema
  );
}
