import { assertDefined } from '@votingworks/basics';
import { promises as fs } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { writeImageData } from '../image_data';
import { pdfToImages } from '..';

/**
 * Reads a PDF file at the given path and writes a series of image files - one
 * for each page. If the PDF file is named `ballot.pdf`, then the image files
 * will be named `ballot-p1.jpg`, `ballot-p2.jpg`, etc. The images are 200 DPI
 * JPGs.
 */
export async function main(
  argv: string[],
  { stderr }: { stderr: NodeJS.WritableStream }
): Promise<number> {
  if (argv.length !== 1) {
    stderr.write('Usage: pdf-to-images PDF_PATH\n');
    return 1;
  }
  const pdfPath = assertDefined(argv[0]);
  const pdf = await fs.readFile(pdfPath);
  const dir = dirname(pdfPath);
  const base = basename(pdfPath, extname(pdfPath));
  for await (const { page, pageNumber } of pdfToImages(pdf, {
    scale: 200 / 72,
  })) {
    const path = join(dir, `${base}-p${pageNumber}.jpg`);
    await writeImageData(path, page);
  }
  return 0;
}
