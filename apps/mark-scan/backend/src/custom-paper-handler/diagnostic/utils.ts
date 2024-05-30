import { ReadElectionError, readElection, readFile } from '@votingworks/fs';
import Buffer from 'buffer';
import {
  ElectionDefinition,
  ElectionPackageFileName,
} from '@votingworks/types';
import { join } from 'path';
import { Result } from '@votingworks/basics';

// Used by state machine
const DIAGNOSTIC_MOCK_BALLOT_PDF_PATH = join(
  __dirname,
  'mocks',
  'diagnostic-mock-ballot.pdf'
);

// Used by state machine tests
export const DIAGNOSTIC_MOCK_BALLOT_JPG_PATH = join(
  __dirname,
  'mocks',
  'diagnostic-mock-ballot.jpg'
);

const DIAGNOSTIC_ELECTION_PATH = join(
  __dirname,
  'mocks',
  ElectionPackageFileName.ELECTION
);

const FILE_MAX_SIZE = 1024 * 1024 * 5; // 5 mb

export async function getPaperHandlerDiagnosticElectionDefinition(
  path: string = DIAGNOSTIC_ELECTION_PATH
): Promise<Result<ElectionDefinition, ReadElectionError>> {
  return readElection(path);
}

export async function getMockBallotPdfData(): Promise<Buffer> {
  const result = await readFile(DIAGNOSTIC_MOCK_BALLOT_PDF_PATH, {
    maxSize: FILE_MAX_SIZE,
  });
  // Error must be handled by caller
  return result.unsafeUnwrap();
}
