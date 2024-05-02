import { readFile } from '@votingworks/fs';
import Buffer from 'buffer';
import {
  ElectionDefinition,
  ElectionPackageFileName,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { join } from 'path';
import { Result, err } from '@votingworks/basics';

// Used by state machine
const DIAGNOSTIC_MOCK_BALLOT_PDF_PATH = join(
  __dirname,
  'diagnostic-mock-ballot.pdf'
);

// Used by state machine tests
export const DIAGNOSTIC_MOCK_BALLOT_JPG_PATH = join(
  __dirname,
  'diagnostic-mock-ballot.jpg'
);
const FILE_MAX_SIZE = 1024 * 1024 * 5; // 5 mb

export async function getPaperHandlerDiagnosticElectionDefinition(
  path: string = join(__dirname, ElectionPackageFileName.ELECTION)
): Promise<Result<ElectionDefinition, Error>> {
  const electionFileReadResult = await readFile(path, {
    maxSize: FILE_MAX_SIZE,
  });
  if (electionFileReadResult.isErr()) {
    return err(new Error(`Failed to read election file at ${path}`));
  }
  const electionData = electionFileReadResult.ok().toString();
  return safeParseElectionDefinition(electionData);
}

export async function getMockBallotPdfData(): Promise<Buffer> {
  const result = await readFile(DIAGNOSTIC_MOCK_BALLOT_PDF_PATH, {
    maxSize: FILE_MAX_SIZE,
  });
  // Error must be handled by caller
  return result.unsafeUnwrap();
}
