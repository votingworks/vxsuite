import { Logger, LogSource, LogEventId } from '@votingworks/logging';
import fs from 'fs';
import * as dotenv from 'dotenv';
import * as dotenvExpand from 'dotenv-expand';
import { isIntegrationTest } from '@votingworks/utils';
import { MOCK_SCANNER_FILES, NODE_ENV } from './globals';
import { LoopScanner, parseBatchesFromEnv } from './loop_scanner';
import { BatchScanner } from './fujitsu_scanner';
import * as server from './server';

export type { Api } from './app';

const isTestEnvironment = NODE_ENV === 'test' || isIntegrationTest();

// https://github.com/bkeepers/dotenv#what-other-env-files-can-i-use
const dotenvPath = '.env';
const dotenvFiles: string[] = [
  `${dotenvPath}.${NODE_ENV}.local`,
  // Don't include `.env.local` for `test` environment
  // since normally you expect tests to produce the same
  // results for everyone
  !isTestEnvironment ? `${dotenvPath}.local` : '',
  `${dotenvPath}.${NODE_ENV}`,
  dotenvPath,
  !isTestEnvironment ? `../../../${dotenvPath}.local` : '',
  `../../../${dotenvPath}`,
].filter(Boolean);

// Load environment variables from .env* files. Suppress warnings using silent
// if this file is missing. dotenv will never modify any environment variables
// that have already been set.  Variable expansion is supported in .env files.
// https://github.com/motdotla/dotenv
// https://github.com/motdotla/dotenv-expand
for (const dotenvFile of dotenvFiles) {
  if (fs.existsSync(dotenvFile)) {
    dotenvExpand.expand(dotenv.config({ path: dotenvFile }));
  }
}

const logger = new Logger(LogSource.VxCentralScanService);

function getScanner(): BatchScanner | undefined {
  const mockScannerFiles = parseBatchesFromEnv(MOCK_SCANNER_FILES);
  if (!mockScannerFiles) return undefined;
  process.stdout.write(
    `Using mock scanner that scans ${mockScannerFiles.reduce(
      (count, sheets) => count + sheets.length,
      0
    )} sheet(s) in ${mockScannerFiles.length} batch(es) repeatedly.\n`
  );
  return new LoopScanner(mockScannerFiles);
}

async function main(): Promise<number> {
  await server.start({ batchScanner: getScanner(), logger });
  return 0;
}

if (require.main === module) {
  void main()
    .catch((error) => {
      void logger.log(LogEventId.ApplicationStartup, 'system', {
        message: `Error in starting Scan Service: ${error.stack}`,
        disposition: 'failure',
      });
      return 1;
    })
    .then((code) => {
      process.exitCode = code;
    });
}
