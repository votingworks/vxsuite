import { tmpNameSync } from 'tmp';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import { createReadStream, createWriteStream, ReadStream } from 'node:fs';
import { Buffer } from 'node:buffer';

/**
 * Given a PDF document, convert it to grayscale and return a read stream to
 * the resulting PDF.
 */
export async function convertPdfToGrayscale(pdf: Buffer): Promise<ReadStream> {
  const tmpPdfFilePath = tmpNameSync();
  const fileStream = createWriteStream(tmpPdfFilePath);
  fileStream.write(pdf);
  fileStream.end();
  const tmpGrayscalePdfFilePath = tmpNameSync();
  await promisify(exec)(`
    gs \
      -sOutputFile=${tmpGrayscalePdfFilePath} \
      -sDEVICE=pdfwrite \
      -sColorConversionStrategy=Gray \
      -dProcessColorModel=/DeviceGray \
      -dNOPAUSE \
      -dBATCH \
      ${tmpPdfFilePath}
  `);
  return createReadStream(tmpGrayscalePdfFilePath);
}
