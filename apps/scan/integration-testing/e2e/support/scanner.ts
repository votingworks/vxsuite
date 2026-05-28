import { getMockFilePdiScannerHandler } from '@votingworks/pdi-scanner';
import { join } from 'node:path';

// apps/scan/integration-testing/e2e/support/ is 5 levels below the repo root
const REPO_ROOT = join(__dirname, '../../../../..');

/** Path to the famous names marked ballot fixture PDF. */
export const FAMOUS_NAMES_MARKED_BALLOT_PATH = join(
  REPO_ROOT,
  'libs/hmpb/fixtures/vx-famous-names/marked-official-ballot.pdf'
);

/** Handler for controlling the mock PDI scanner from tests. */
export const mockPdiScannerHandler = getMockFilePdiScannerHandler();
