/* istanbul ignore file */
import { sleep } from '@votingworks/basics';
import { readFileSync } from 'node:fs';
import { LogSource, BaseLogger } from '@votingworks/logging';
import { detectPrinter } from './printer';
import { Printer } from './types';

async function printStatus(printer: Printer, stdout: NodeJS.WriteStream) {
  const status = await printer.status();
  if (status.connected) {
    stdout.write(
      `${JSON.stringify({
        connected: true,
        printerType: status.config.label,
        status: status.richStatus ? status.richStatus : undefined,
      })}\n`
    );
  }
}

async function watchPrinter(printer: Printer): Promise<never> {
  const { stdout } = process;
  for (;;) {
    await printStatus(printer, stdout);
    await sleep(1000);
  }
}

const USAGE = `Usage: printer status
       printer watch
       printer print path-to-pdf
`;

export async function main(args: string[]): Promise<number> {
  const { stdout, stderr } = process;
  const command = args[2];
  const printer = detectPrinter(new BaseLogger(LogSource.System));
  switch (command) {
    case 'status': {
      await printStatus(printer, stdout);
      break;
    }
    case 'watch': {
      await watchPrinter(printer);
      break;
    }
    case 'print': {
      const pdfPath = args[3];
      await printer.print({ data: readFileSync(pdfPath) });
      break;
    }
    case undefined: {
      stderr.write(USAGE);
      break;
    }
    default: {
      stderr.write(`Unknown command: ${command}\n`);
      stderr.write(USAGE);
      return 1;
    }
  }
  return 0;
}
