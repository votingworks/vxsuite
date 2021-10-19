// Import the rest of our application.
import { MockScannerClient, ScannerClient } from '@votingworks/plustek-sdk';
import { ok, Result } from '@votingworks/types';
import {
  MOCK_SCANNER_FILES,
  MOCK_SCANNER_HTTP,
  MOCK_SCANNER_PORT,
  MODULE_SCAN_ALWAYS_HOLD_ON_REJECT,
  VX_MACHINE_TYPE,
} from './globals';
import LoopScanner, { parseBatchesFromEnv } from './LoopScanner';
import { plustekMockServer, PlustekScanner, Scanner } from './scanners';
import * as server from './server';

async function getScanner(): Promise<Scanner | undefined> {
  if (VX_MACHINE_TYPE === 'precinct-scanner') {
    if (MOCK_SCANNER_HTTP) {
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
      return new PlustekScanner(
        {
          get: async (): Promise<Result<ScannerClient, Error>> => ok(client),
        },
        MODULE_SCAN_ALWAYS_HOLD_ON_REJECT
      );
    }
  } else {
    const mockScannerFiles = parseBatchesFromEnv(MOCK_SCANNER_FILES);

    if (mockScannerFiles) {
      process.stdout.write(
        `Using mock scanner that scans ${mockScannerFiles.reduce(
          (count, sheets) => count + sheets.length,
          0
        )} sheet(s) in ${mockScannerFiles.length} batch(es) repeatedly.\n`
      );
      return new LoopScanner(mockScannerFiles);
    }
  }

  return undefined;
}

async function main(): Promise<number> {
  await server.start({ scanner: await getScanner() });
  return 0;
}

if (require.main === module) {
  void main()
    .catch((error) => {
      process.stderr.write(`CRASH: ${error}\n`);
      return 1;
    })
    .then((code) => {
      process.exitCode = code;
    });
}
