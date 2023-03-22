import chalk from 'chalk';
import { Optional, sleep } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { writeFile } from 'fs/promises';
import * as readline from 'readline';
import { inspect } from 'util';
import { openScanner } from '../../open_scanner';
import {
  DoubleSheetDetectOpt,
  ErrorCode,
  FormMovement,
  FormStanding,
  ImageColorDepthType,
  ImageResolution,
  ReleaseType,
  ScanParameters,
  ScanSide,
} from '../../types';
import { CustomScanner } from '../../types/custom_scanner';

function readlines(prompt = '> '): AsyncIterableIterator<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const iterator: AsyncIterableIterator<string> = {
    [Symbol.asyncIterator]: () => iterator,
    async next() {
      return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
          resolve({ done: false, value: answer });
        });
      });
    },

    return() {
      rl.close();
      return Promise.resolve({ done: true, value: undefined });
    },
  };

  return iterator;
}

/**
 * Simple demo program for using the Custom A4 scanner.
 */
export async function main(): Promise<number> {
  const { stdout, stderr } = process;
  let scanner: Optional<CustomScanner>;

  process.on('SIGINT', async () => {
    await scanner?.disconnect();
    process.exit(0);
  });

  async function reconnect(): Promise<void> {
    scanner = (await openScanner()).assertOk('failed to open scanner');
  }

  await reconnect();

  function writeOutput(
    message: unknown,
    stream: NodeJS.WritableStream = stdout
  ): void {
    stream.write(
      typeof message === 'string'
        ? message
        : inspect(message, { colors: stream === stdout || stream === stderr })
    );
    stream.write('\n');
  }

  const prompt = [
    chalk.bold('Command List'),
    'exit - Disconnect the scanner',
    'model - Print the model information',
    'firmware - Print the firmware version',
    'hardware - Print the hardware version ',
    'status - Print the current scanner status',
    'scan - Scan a sheet',
    'reset - Reset the hardware, you will need to call reconnect after issuing this command.',
    'connect - Calls connect on the scanner',
    'disconnect - Calls disconnect on the scanner',
    'reconnect - Establishes a fresh scanner connection',
    'eject - Ejects the paper forward',
    'retract - Retracts the paper',
    'load - Loads paper',
    '',
    chalk.bold('Enter a command: '),
  ].join('\n');

  for await (const line of readlines(prompt)) {
    if (!scanner) {
      break;
    }

    switch (line) {
      case 'exit': {
        await scanner.disconnect();
        scanner = undefined;
        break;
      }

      case 'model': {
        const model = await scanner.getReleaseVersion(ReleaseType.Model);
        writeOutput(model);
        break;
      }

      case 'firmware': {
        writeOutput(await scanner.getReleaseVersion(ReleaseType.Firmware));
        break;
      }

      case 'hardware': {
        writeOutput(await scanner.getReleaseVersion(ReleaseType.Hardware));
        break;
      }

      case 'status': {
        writeOutput(await scanner.getStatus());
        break;
      }

      case 'scan': {
        const scanParameters: ScanParameters = {
          wantedScanSide: ScanSide.A_AND_B,
          formStandingAfterScan: FormStanding.HOLD_TICKET,
          resolution: ImageResolution.RESOLUTION_200_DPI,
          imageColorDepth: ImageColorDepthType.Grey8bpp,
          doubleSheetDetection: DoubleSheetDetectOpt.DetectOff,
        };
        const scanResult = await scanner.scan(scanParameters);

        if (scanResult.isErr()) {
          writeOutput(`Scan failed: ${inspect(scanResult.err())}`, stderr);
        } else {
          const [sideA, sideB] = scanResult.ok();

          writeOutput('Writing side A to sideA.pgm...');
          await writeFile(
            'sideA.pgm',
            Buffer.concat([
              Buffer.from('P5\n'),
              Buffer.from(`${sideA.imageWidth} ${sideA.imageHeight}\n`),
              Buffer.from('255\n'),
              sideA.imageBuffer,
            ])
          );

          writeOutput('Writing side B to sideB.pgm...');
          await writeFile(
            'sideB.pgm',
            Buffer.concat([
              Buffer.from('P5\n'),
              Buffer.from(`${sideB.imageWidth} ${sideB.imageHeight}\n`),
              Buffer.from('255\n'),
              sideB.imageBuffer,
            ])
          );
        }
        break;
      }

      case 'reset':
        writeOutput(await scanner.resetHardware());
        await sleep(500);
        break;

      case 'eject': {
        const moveResult = await scanner.move(FormMovement.EJECT_PAPER_FORWARD);
        writeOutput(
          moveResult.isOk()
            ? 'ejected'
            : `failed to eject: ${ErrorCode[moveResult.err()]}`
        );
        break;
      }

      case 'retract':
        writeOutput(await scanner.move(FormMovement.RETRACT_PAPER_BACKWARD));
        break;

      case 'load':
        writeOutput(await scanner.move(FormMovement.LOAD_PAPER));
        break;

      case 'connect':
        writeOutput(await scanner.connect());
        break;

      case 'disconnect':
        writeOutput(await scanner.disconnect());
        break;

      case 'reconnect': {
        await reconnect();
        const newScanner = await openScanner();
        writeOutput(newScanner);
        scanner = newScanner.assertOk('failed to open scanner');
        break;
      }

      default:
        writeOutput('invalid input', stderr);
        break;
    }

    if (!scanner) {
      break;
    }

    writeOutput('');
  }

  return 0;
}
