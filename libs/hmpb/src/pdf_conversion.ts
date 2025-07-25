import { tmpNameSync } from 'tmp';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';

/**
 * Given a PDF document, convert it to grayscale.
 */
export async function convertPdfToGrayscale(
  pdf: Uint8Array
): Promise<Uint8Array> {
  const tmpPdfFilePath = tmpNameSync();
  await writeFile(tmpPdfFilePath, pdf);
  const tmpGrayscalePdfFilePath = tmpNameSync();
  await promisify(execFile)('gs', [
    `-sOutputFile=${tmpGrayscalePdfFilePath}`,
    '-sDEVICE=pdfwrite',
    '-sColorConversionStrategy=Gray',
    '-dProcessColorModel=/DeviceGray',
    '-dNOPAUSE',
    '-dBATCH',
    tmpPdfFilePath,
  ]);
  try {
    return Uint8Array.from(await readFile(tmpGrayscalePdfFilePath));
  } finally {
    await rm(tmpGrayscalePdfFilePath);
    await rm(tmpPdfFilePath);
  }
}

/**
 * Given a PDF document, convert it to CMYK.
 */
export async function convertPdfToCmyk(pdf: Uint8Array): Promise<Uint8Array> {
  const tmpPdfFilePath = tmpNameSync();
  await writeFile(tmpPdfFilePath, pdf);
  const tmpCmykPdfFilePath = tmpNameSync();
  await promisify(execFile)('gs', [
    `-sOutputFile=${tmpCmykPdfFilePath}`,
    '-sDEVICE=pdfwrite',
    '-sColorConversionStrategy=CMYK',
    '-sColorConversionStrategyForImages=CMYK',
    '-dProcessColorModel=/DeviceCMYK',
    '-dNOPAUSE',
    '-dBATCH',
    tmpPdfFilePath,
  ]);
  try {
    return Uint8Array.from(await readFile(tmpCmykPdfFilePath));
  } finally {
    await rm(tmpCmykPdfFilePath);
    await rm(tmpPdfFilePath);
  }
}
