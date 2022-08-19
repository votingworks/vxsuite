// Import the rest of our application.
import { MockScannerClient, ScannerClient } from '@votingworks/plustek-sdk';
import { Logger, LogSource, LogEventId } from '@votingworks/logging';
import { ok, Result } from '@votingworks/types';
import {
  MOCK_SCANNER_FILES,
  MOCK_SCANNER_HTTP,
  MOCK_SCANNER_PORT,
  VX_MACHINE_TYPE,
} from './globals';
import { LoopScanner, parseBatchesFromEnv } from './loop_scanner';
import { BatchScanner } from './fujitsu_scanner';
import * as server from './server';
import { plustekMockServer } from './plustek_mock_server';

const logger = new Logger(LogSource.VxScanService);

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
const createPlustekClient =
  VX_MACHINE_TYPE === 'precinct-scanner' && MOCK_SCANNER_HTTP
    ? createMockPlustekClient
    : undefined;

function getScanner(): BatchScanner | undefined {
  if (VX_MACHINE_TYPE !== 'bsd') return undefined;

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
  await server.start({ scanner: getScanner(), createPlustekClient });
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
