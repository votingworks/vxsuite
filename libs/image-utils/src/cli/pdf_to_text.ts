import { jsonStream } from '@votingworks/utils';
import * as fs from 'fs';
import { join, parse } from 'path';
import { pipeline } from 'stream/promises';
import { pdfToText } from '..';

/**
 * Reads a PDF file at the given path and writes a series of image files - one
 * for each page. If the PDF file is named `ballot.pdf`, then the image files
 * will be named `ballot-p1.jpg`, `ballot-p2.jpg`, etc. The images are 200 DPI
 * JPGs.
 */
/* istanbul ignore next */
export async function main(
  argv: string[],
  { stderr }: { stderr: NodeJS.WritableStream }
): Promise<number> {
  const pdfPath = argv[0];
  if (!pdfPath) {
    stderr.write('Usage: pdf-to-text PDF_PATH\n');
    return 1;
  }
  const pdf = await fs.promises.readFile(pdfPath);
  const { dir, base, name } = parse(pdfPath);

  await pipeline(
    jsonStream(
      {
        input: base,
        pages: pdfToText(pdf),
      },
      { compact: false }
    ),
    fs.createWriteStream(join(dir, `${name}.json`))
  );

  return 0;
}
