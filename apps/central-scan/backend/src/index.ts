import { fileURLToPath } from 'node:url';
import { BaseLogger, LogSource, LogEventId } from '@votingworks/logging';
import { assert } from '@votingworks/basics';
import {
  handleUncaughtExceptions,
  loadEnvVarsFromDotenvFiles,
} from '@votingworks/backend';
import * as server from './server.js';

export type { Api } from './app.js';
export type { ScanDiagnosticOutcome } from './diagnostic.js';
export * from './types.js';

loadEnvVarsFromDotenvFiles();

const logger = new BaseLogger(LogSource.VxCentralScanService);

function main(): number {
  handleUncaughtExceptions(logger);

  server.start({ logger });
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    assert(error instanceof Error);
    logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `Error in starting Scan Service: ${error.stack}`,
      disposition: 'failure',
    });
    process.exitCode = 1;
  }
}
