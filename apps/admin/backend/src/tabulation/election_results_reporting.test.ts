import { LogEventId, mockLogger } from '@votingworks/logging';
import { testElectionReport } from '@votingworks/types';
import { writeFile } from 'fs/promises';
import { tmpNameSync } from 'tmp';
import { assert } from 'console';
import { parseElectionResultsReportingFile } from './election_results_reporting';

test('reads and parses an Election Results Reporting file', async () => {
  const errContents = testElectionReport;
  const filepath = tmpNameSync();
  await writeFile(filepath, JSON.stringify(errContents));

  const logger = mockLogger();

  const result = await parseElectionResultsReportingFile(filepath, logger);
  assert(result.isOk(), 'Unexpected error in test when parsing ERR file');
  expect(result.ok()).toEqual(errContents);
});

test('logs on file reading error', async () => {
  const logger = mockLogger();
  const result = await parseElectionResultsReportingFile(
    './not/a/real/filepath',
    logger
  );
  expect(result.isErr()).toEqual(true);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileReadError,

    'unknown',
    {
      message:
        'An error occurred when reading ERR file: {"type":"OpenFileError","error":{"errno":-2,"code":"ENOENT","syscall":"open","path":"./not/a/real/filepath"}}',
    }
  );
});
