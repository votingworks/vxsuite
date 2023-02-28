import { sleep } from '@votingworks/basics';
import { Optional } from '@votingworks/types';
import { Buffer } from 'buffer';
import { assert } from 'console';
import { writeFile } from 'fs/promises';
import * as readline from 'readline';
import { openScanner } from '../../open_scanner';
import {
  DoubleSheetDetectOpt,
  FormMovement,
  FormStanding,
  ImageColorDepthType,
  ImageResolution,
  ReleaseType,
  ScanParameters,
  ScanSide,
} from '../../types';
import { CustomScanner } from '../../types/custom_scanner';
// import { watchStatus } from '../../utils/status_watcher';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Simple demo program for using the Custom A4 scanner.
 */
export async function main(): Promise<number> {
  let initialScanner: Optional<CustomScanner>;

  process.on('SIGINT', async () => {
    await initialScanner?.disconnect();
    process.exit(0);
  });

  function takeUserInput(scanner: CustomScanner) {
    const helpInfo = `Command List  
    exit - Disconnect the scanner
    model - Print the model information
    firmware - Print the firmware version
    hardware - Print the hardware version 
    status - Print the current scanner status
    scan - Scan a sheet
    reset - Reset the hardware, you will need to call reconnect after issuing this command.
    connect - Calls connect on the scanner
    disconnect - Calls disconnect on the scanner
    reconnect - Establishes a fresh scanner connection
    eject - Ejects the paper forward
    retract - Retracts the paper
    load - Loads paper 
    `;
    rl.question(`${helpInfo}\n Command: `, async (answer) => {
      switch (answer) {
        case 'exit': {
          await scanner?.disconnect();
          return rl.close();
        }
        case 'model': {
          const model = (
            await scanner.getReleaseVersion(ReleaseType.Model)
          ).assertOk('failed to get model');
          console.log('Model is ', model);
          return takeUserInput(scanner);
        }
        case 'firmware': {
          const firmware = (
            await scanner.getReleaseVersion(ReleaseType.Firmware)
          ).assertOk('failed to get firmware');
          console.log('Firmware is: ', firmware);
          return takeUserInput(scanner);
        }
        case 'hardware': {
          const hardware = (
            await scanner.getReleaseVersion(ReleaseType.Hardware)
          ).assertOk('failed to get hardware');
          console.log('Hardware is: ', hardware);
          return takeUserInput(scanner);
        }
        case 'status': {
          const status = await scanner.getStatus();
          console.log('Status is: ', status);
          return takeUserInput(scanner);
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
            console.error('Scan failed:', scanResult.err());
          } else {
            const [sideA, sideB] = scanResult.ok();

            console.log('Writing side A to sideA.pgm...');
            await writeFile(
              'sideA.pgm',
              Buffer.concat([
                Buffer.from('P5\n'),
                Buffer.from(`${sideA.imageWidth} ${sideA.imageHeight}\n`),
                Buffer.from('255\n'),
                sideA.imageBuffer,
              ])
            );

            console.log('Writing side B to sideB.pgm...');
            await writeFile(
              'sideB.pgm',
              Buffer.concat([
                Buffer.from('P5\n'),
                Buffer.from(`${sideB.imageWidth} ${sideB.imageHeight}\n`),
                Buffer.from('255\n'),
                sideA.imageBuffer,
              ])
            );
          }
          return takeUserInput(scanner);
        }
        case 'reset':
          console.log(await scanner.resetHardware());
          await sleep(500);
          return takeUserInput(scanner);
        case 'eject':
          console.log(await scanner.move(FormMovement.EJECT_PAPER_FORWARD));
          return takeUserInput(scanner);
        case 'retract':
          console.log(await scanner.move(FormMovement.RETRACT_PAPER_BACKWARD));
          return takeUserInput(scanner);
        case 'load':
          console.log(await scanner.move(FormMovement.LOAD_PAPER));
          return takeUserInput(scanner);
        case 'connect':
          console.log(await scanner.connect());
          return takeUserInput(scanner);
        case 'disconnect':
          console.log(await scanner.disconnect());
          return takeUserInput(scanner);
        case 'reconnect': {
          const newScanner = (await openScanner()).ok();
          console.log(newScanner);
          assert(newScanner);
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          return takeUserInput(newScanner!);
        }
        default:
          console.log('invalid input');
          return takeUserInput(scanner);
      }
    });
  }
  initialScanner = (await openScanner()).assertOk('failed to open scanner');

  takeUserInput(initialScanner);
  return 0;
}
