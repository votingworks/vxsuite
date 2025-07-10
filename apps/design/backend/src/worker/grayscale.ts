import { tmpNameSync } from 'tmp';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';

/**
 * Given a PDF document, convert it to grayscale and return a read stream to
 * the resulting PDF.
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
    return await readFile(tmpGrayscalePdfFilePath);
  } finally {
    await rm(tmpGrayscalePdfFilePath);
    await rm(tmpPdfFilePath);
  }
}
