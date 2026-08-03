// Import the rest of our application.
import { fileURLToPath } from 'node:url';
import { BaseLogger, LogSource, LogEventId } from '@votingworks/logging';
import {
  handleUncaughtExceptions,
  loadEnvVarsFromDotenvFiles,
} from '@votingworks/backend';
import * as server from './server.js';

export type { Api } from './app.js';
export type { ClientApi } from './client_app.js';
export type { PeerApi } from './peer_app.js';
export type { TallyReportSpec } from './reports/tally_report.js';
export type { BallotCountReportSpec } from './reports/ballot_count_report.js';
export type {
  TallyReportWarning,
  BallotCountReportWarning,
} from './reports/warnings.js';
export type { NetworkConnectionStatus } from './client_app.js';
export * from './types.js';

loadEnvVarsFromDotenvFiles();

const logger = new BaseLogger(LogSource.VxAdminService);

async function main(): Promise<number> {
  handleUncaughtExceptions(logger);

  await server.start({});
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
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
