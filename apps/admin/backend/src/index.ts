// Import the rest of our application.
import { BaseLogger, LogSource, LogEventId } from '@votingworks/logging';
import {
  handleUncaughtExceptions,
  loadEnvVarsFromDotenvFiles,
} from '@votingworks/backend';
import * as server from './server';

export type { Api } from './app';
export type { TallyReportSpec } from './reports/tally_report';
export type { BallotCountReportSpec } from './reports/ballot_count_report';
export type {
  TallyReportWarning,
  BallotCountReportWarning,
} from './reports/warnings';
export * from './types';

loadEnvVarsFromDotenvFiles();

const logger = new BaseLogger(LogSource.VxAdminService);

async function main(): Promise<number> {
  handleUncaughtExceptions(logger);

  await server.start({});
  return 0;
}

if (require.main === module) {
  void main()
    .catch((error) => {
      logger.log(LogEventId.ApplicationStartup, 'system', {
        message: `Error in starting Admin Service: ${error.stack}`,
        disposition: 'failure',
      });
      return 1;
    })
    .then((code) => {
      process.exitCode = code;
    });
}
