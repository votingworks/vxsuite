import { BaseLogger, LogSource, LogEventId } from '@votingworks/logging';
import { assert } from '@votingworks/basics';
import {
  handleUncaughtExceptions,
  loadEnvVarsFromDotenvFiles,
} from '@votingworks/backend';
import * as server from './server';

export type { Api } from './app';
export type { ScanDiagnosticOutcome } from './diagnostic';
export * from './types';

loadEnvVarsFromDotenvFiles();

const logger = new BaseLogger(LogSource.VxCentralScanService);

function main(): number {
  handleUncaughtExceptions(logger);

  server.start({ logger });
  return 0;
}

if (require.main === module) {
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
