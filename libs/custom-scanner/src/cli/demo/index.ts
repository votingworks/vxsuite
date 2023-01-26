import { Optional } from '@votingworks/types';
import { Buffer } from 'buffer';
import { writeFile } from 'fs/promises';
import { Scanner } from '../../scanner';
import {
  DoubleSheetDetectOpt,
  FormStanding,
  ImageColorDepthType,
  ImageResolution,
  ReleaseType,
  ScanParameters,
  ScanSide,
  SensorStatus,
} from '../../types';

/**
 * Simple demo program for using the Custom A4 scanner.
 */
export async function main(): Promise<number> {
  let scanner: Optional<Scanner>;

  process.on('SIGINT', async () => {
    await scanner?.disconnect();
    process.exit(0);
  });

  scanner = (await Scanner.open()).assertOk('failed to open scanner');

  const model = (await scanner.getReleaseVersion(ReleaseType.Model)).assertOk(
    'failed to get model'
  );
  const firmware = (
    await scanner.getReleaseVersion(ReleaseType.Firmware)
  ).assertOk('failed to get firmware');
  const hardware = (
    await scanner.getReleaseVersion(ReleaseType.Hardware)
  ).assertOk('failed to get hardware');

  console.log({ model, firmware, hardware });

  const watcher = scanner.watchStatus();

  process.stdout.write('> Waiting for paper to scan…\n');

  for await (const result of watcher) {
    if (result.isErr()) {
      console.error(result.err());
    } else {
      const status = result.ok();

      console.log(
        `${status.isScanInProgress ? 'SCAN' : 'NO SCAN'}, ` +
          `${status.isMotorOn ? 'MOVE' : 'NO MOVE'}, ` +
          `LL ${SensorStatus[status.sensorInputLeftLeft]}, ` +
          `CL ${SensorStatus[status.sensorInputCenterLeft]}, ` +
          `CR ${SensorStatus[status.sensorInputCenterRight]}, ` +
          `RR ${SensorStatus[status.sensorInputRightRight]}`
      );

      if (status.isTicketOnEnterA4 && !status.isMotorOn) {
        watcher.stop();
        console.log('Scanning…');
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

        // console.log(
        //   'Move result:',
        //   await scanner.move(FormMovement.EJECT_PAPER_FORWARD)
        // );
        // console.log('Start scan:', await scanner.startScan());
        // setTimeout(async () => {
        //   console.log('Stop scan:', await scanner?.stopScan());
        // }, 1500);
      }
    }
  }

  await scanner.disconnect();

  return 0;
}
