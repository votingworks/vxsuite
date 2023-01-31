import { MockScannerClient, ScannerClient } from '@votingworks/plustek-scanner';
import { Logger, LogSource, LogEventId } from '@votingworks/logging';
import { ok, Result } from '@votingworks/basics';
import fs from 'fs';
import * as dotenv from 'dotenv';
import * as dotenvExpand from 'dotenv-expand';
import { MOCK_SCANNER_HTTP, MOCK_SCANNER_PORT, NODE_ENV } from './globals';
import * as server from './server';
import { plustekMockServer } from './plustek_mock_server';

export type { Api } from './app';
export * from './types';

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

const logger = new Logger(LogSource.VxScanBackend);

async function createMockPlustekClient(): Promise<
  Result<ScannerClient, Error>
> {
  const client = new MockScannerClient();
  await client.connect();
  const port = MOCK_SCANNER_PORT;
  process.stdout.write(
    `Starting mock plustek scanner API at http://localhost:${port}/mock\n`
  );
  process.stdout.write(
    `→ Load paper: curl -X PUT -d '{"files":["/path/to/front.jpg", "/path/to/back.jpg"]}' -H 'Content-Type: application/json' http://localhost:${port}/mock\n`
  );
  process.stdout.write(
    `→ Remove paper: curl -X DELETE http://localhost:${port}/mock\n`
  );
  plustekMockServer(client).listen(port);
  return ok(client);
}
const createPlustekClient = MOCK_SCANNER_HTTP
  ? createMockPlustekClient
  : undefined;

async function main(): Promise<number> {
  await server.start({ createPlustekClient });
  return 0;
}

if (require.main === module) {
  void main()
    .catch((error) => {
      void logger.log(LogEventId.ApplicationStartup, 'system', {
        message: `Error in starting VxScan backend: ${error.stack}`,
        disposition: 'failure',
      });
      return 1;
    })
    .then((code) => {
      process.exitCode = code;
    });
}
