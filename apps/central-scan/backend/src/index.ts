import { BaseLogger, LogSource, LogEventId } from '@votingworks/logging';
import { assert, iter } from '@votingworks/basics';
import {
  handleUncaughtExceptions,
  loadEnvVarsFromDotenvFiles,
} from '@votingworks/backend';
import { MOCK_SCANNER_FILES } from './globals';
import { LoopScanner, parseBatchesFromEnv } from './loop_scanner';
import { BatchScanner } from './fujitsu_scanner';
import * as server from './server';

export type { Api } from './app';
export type { ScanDiagnosticOutcome } from './diagnostic';
export * from './types';

loadEnvVarsFromDotenvFiles();

const logger = new BaseLogger(LogSource.VxCentralScanService);

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

function main(): number {
  handleUncaughtExceptions(logger);

  server.start({ batchScanner: getScanner(), logger });
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
