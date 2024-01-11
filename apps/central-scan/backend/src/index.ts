import { Logger, LogSource, LogEventId } from '@votingworks/logging';
import { iter } from '@votingworks/basics';
import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { MOCK_SCANNER_FILES } from './globals';
import { LoopScanner, parseBatchesFromEnv } from './loop_scanner';
import { BatchScanner } from './fujitsu_scanner';
import * as server from './server';

export type { Api } from './app';

loadEnvVarsFromDotenvFiles();

const logger = new Logger(LogSource.VxCentralScanService);

function getScanner(): BatchScanner | undefined {
  const mockScannerFiles = parseBatchesFromEnv(MOCK_SCANNER_FILES);
  if (!mockScannerFiles) return undefined;
  process.stdout.write(
    `Using mock scanner that scans ${iter(mockScannerFiles)
      .map((sheets) => sheets.length)
      .sum()} sheet(s) in ${mockScannerFiles.length} batch(es) repeatedly.\n`
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
