import { Buffer } from 'node:buffer';
import { promises as fs } from 'node:fs';
import { inspect } from 'node:util';
import {
  DoubleSheetDetectOpt,
  FormStanding,
  ImageColorDepthType,
  ImageFromScanner,
  ImageResolution,
  openScanner,
  ScanSide,
} from '../src';

/**
 * Encodes the images as PGM files. We choose this format because it is simple
 * and widely supported.
 */
function encodeImageFromScannerAsPgm(
  imageFromScanner: ImageFromScanner
): Buffer {
  return Buffer.concat([
    Buffer.from(
      `P5\n${imageFromScanner.imageWidth} ${imageFromScanner.imageHeight}\n255\n`
    ),
    imageFromScanner.imageBuffer,
  ]);
}

/**
 * A simple example that scans a sheet of paper and saves the resulting images
 * to a.pgm and b.pgm.
 */
async function main() {
  const scanner = (await openScanner()).assertOk(
    'Failed to open scanner. Is the device plugged in?'
  );

  const scanResult = await scanner.scan({
    wantedScanSide: ScanSide.A_AND_B,
    resolution: ImageResolution.RESOLUTION_200_DPI,
    imageColorDepth: ImageColorDepthType.Grey8bpp,
    formStandingAfterScan: FormStanding.DRIVE_FORWARD,
    doubleSheetDetection: DoubleSheetDetectOpt.DetectOff,
  });

  if (scanResult.isOk()) {
    const [sideA, sideB] = scanResult.ok();
    await fs.writeFile('a.pgm', encodeImageFromScannerAsPgm(sideA));
    await fs.writeFile('b.pgm', encodeImageFromScannerAsPgm(sideB));
    process.stdout.write('Wrote a.pgm and b.pgm\n');
  } else {
    process.stderr.write(`Scan failed: ${inspect(scanResult.err())}\n`);
  }

  await scanner.disconnect();
}

main().catch((error) => {
  process.stderr.write(`${inspect(error)}\n`);
  process.exit(1);
});
