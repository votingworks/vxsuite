// Import the rest of our application.
import { interpret } from '@votingworks/ballot-interpreter-nh';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { ElectionDefinition, Result } from '@votingworks/types';
import { join } from 'path';
import { Importer } from './importer';
import { LoopScanner, parseBatchesFromEnv } from './loop_scanner';
import { FujitsuScanner, Scanner } from './scanners';
import * as server from './server';
import { Store } from './store';
import { PageInterpretationWithFiles, SheetOf } from './types';

const logger = new Logger(LogSource.VxScanService);

function getScanner(): Scanner {
  const batches = parseBatchesFromEnv(process.env.MOCK_SCANNER_FILES);
  return batches ? new LoopScanner(batches) : new FujitsuScanner({ logger });
}

async function main(): Promise<number> {
  const store = await Store.fileStore(join(__dirname, '..', 'dev-workspace'));
  const scanner = getScanner();
  const importer = new Importer({
    store,
    scanner,
    interpreters: [
      {
        name: 'nh',
        async interpret(
          electionDefinition: ElectionDefinition,
          sheet: SheetOf<string>
        ): Promise<Result<SheetOf<PageInterpretationWithFiles>, Error>> {
          console.log('nh interpret');
          const result = await interpret(electionDefinition, sheet);
          console.log('result', result.ok(), 'err', result.err());
          return result;
        },
      },
    ],
  });
  await server.start({ importer, store });
  return 0;
}

if (require.main === module) {
  void main()
    .catch((error) => {
      console.error(error.stack);
      void logger.log(LogEventId.ApplicationStartup, 'system', {
        message: `Error in starting Scan Service: ${error}`,
        disposition: 'failure',
      });
      return 1;
    })
    .then((code) => {
      process.exitCode = code;
    });
}
