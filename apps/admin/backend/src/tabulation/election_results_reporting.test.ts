import { expect, test, vi } from 'vitest';
import { makeTemporaryFile } from '@votingworks/fixtures';
import { LogEventId, mockLogger } from '@votingworks/logging';
import { testElectionReport } from '@votingworks/types';
import { err } from '@votingworks/basics';
import { parseElectionResultsReportingFile } from './election_results_reporting';

test('reads and parses an Election Results Reporting file', async () => {
  const errContents = testElectionReport;
  const filepath = makeTemporaryFile({ content: JSON.stringify(errContents) });

  const logger = mockLogger({ fn: vi.fn });

  const electionReport = (
    await parseElectionResultsReportingFile(filepath, logger)
  ).unsafeUnwrap();
  expect(electionReport).toEqual(errContents);
});

test('logs on file reading error', async () => {
  const logger = mockLogger({ fn: vi.fn });
  const result = await parseElectionResultsReportingFile(
    './not/a/real/filepath',
    logger
  );
  expect(result).toEqual(err(expect.anything()));
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileReadError,

    'unknown',
    {
      message:
        'An error occurred when reading ERR file: {"type":"OpenFileError","error":{"errno":-2,"code":"ENOENT","syscall":"open","path":"./not/a/real/filepath"}}',
    }
  );
});
