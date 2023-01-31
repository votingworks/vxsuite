// Import the rest of our application.
import fs from 'fs';
import { Logger, LogSource, LogEventId } from '@votingworks/logging';
import * as dotenv from 'dotenv';
import * as dotenvExpand from 'dotenv-expand';

import { NODE_ENV } from './globals';
import * as server from './server';

// https://github.com/bkeepers/dotenv#what-other-env-files-can-i-use
const dotenvPath = '.env';
const dotenvFiles: string[] = [
  `${dotenvPath}.${NODE_ENV}.local`,
  // Don't include `.env.local` for `test` environment
  // since normally you expect tests to produce the same
  // results for everyone
  NODE_ENV !== 'test' ? `${dotenvPath}.local` : '',
  `${dotenvPath}.${NODE_ENV}`,
  dotenvPath,
  NODE_ENV !== 'test' ? `../../${dotenvPath}.local` : '',
  `../../${dotenvPath}`,
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

const logger = new Logger(LogSource.VxAdminService);

async function main(): Promise<number> {
  await server.start({});
  return 0;
}

if (require.main === module) {
  void main()
    .catch((error) => {
      void logger.log(LogEventId.ApplicationStartup, 'system', {
        message: `Error in starting Admin Service: ${error.stack}`,
        disposition: 'failure',
      });
      return 1;
    })
    .then((code) => {
      process.exitCode = code;
    });
}
