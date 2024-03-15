import { ImageData } from '@napi-rs/canvas';
import { assertDefined } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { execFile as execFileCallback } from 'child_process';
import { promises as fs } from 'fs';
import { writeFile } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { dirSync, tmpNameSync } from 'tmp';
import { promisify } from 'util';
import { loadImageData } from './image_data';

const execFile = promisify(execFileCallback);

/**
 * A page of a PDF document.
 */
export interface PdfPage {
  readonly pageNumber: number;
  readonly pageCount: number;
  readonly page: ImageData;
}

/**
 * Uses `pdftoppm` to convert a PDF file to a series of image files - one for
 * each page. If the PDF file is named `ballot.pdf`, then the image files will
 * be named `ballot-1.jpg`, `ballot-2.jpg`, etc. The images are 200 DPI.
 */
export async function pdfAtPathToImagePaths(
  pdfPath: string,
  {
    format = 'png',
    scale = 200 / 72,
    outDir,
    prefix = 'page',
  }: {
    format?: 'png' | 'jpeg';
    scale?: number;
    outDir?: string;
    prefix?: string;
  } = {}
): Promise<string[]> {
  const dir = outDir ?? dirSync().name;

  if (format !== 'png' && format !== 'jpeg') {
    throw new Error(`Invalid format: ${format}`);
  }

  // convert the PDF to images
  const { stderr } = await execFile('pdftoppm', [
    '-jpeg',
    '-rx',
    String(scale * 72),
    '-ry',
    String(scale * 72),
    pdfPath,
    join(dir, prefix),
  ]);

  if (stderr) {
    throw new Error(`pdftoppm failed: ${stderr}`);
  }

  // Return the image paths. pdftoppm creates one file for each page, named
  // `page-N.jpg`, where N is the page number. The files are dynamically
  // zero-padded to ensure they sort correctly.
  //
  // https://github.com/justmoon/poppler-http/blob/83de64d70a74501916a0155dad6c66887178d2bc/utils/pdftoppm.cc#L288C3-L319C81
  return (await fs.readdir(dir))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => join(dir, file));
}

/**
 * Renders PDF pages as images.
 */
export async function* pdfToImages(
  pdfBytes: Buffer,
  { scale = 1 } = {}
): AsyncIterable<PdfPage> {
  const pdfPath = tmpNameSync({ postfix: '.pdf' });
  await writeFile(pdfPath, pdfBytes);

  const pagePaths = await pdfAtPathToImagePaths(pdfPath, {
    scale,
    format: 'png',
  });

  for (const [pageNumber0, pagePath] of pagePaths.entries()) {
    const page = await loadImageData(pagePath);
    yield {
      pageNumber: pageNumber0 + 1,
      pageCount: pagePaths.length,
      page,
    };
  }
}

/**
 * Reads a PDF file at the given path and writes a series of image files - one
 * for each page. If the PDF file is named `ballot.pdf`, then the image files
 * will be named `ballot-1.jpg`, `ballot-2.jpg`, etc. The images are 200 DPI
 * JPGs.
 */
/* istanbul ignore next */
export async function main(
  argv: string[],
  { stderr }: { stderr: NodeJS.WritableStream }
): Promise<number> {
  if (argv.length !== 1) {
    stderr.write('Usage: pdf-to-images PDF_PATH\n');
    return 1;
  }
  const pdfPath = assertDefined(argv[0]);
  const outDir = dirname(pdfPath);
  const base = basename(pdfPath, extname(pdfPath));
  await pdfAtPathToImagePaths(pdfPath, {
    scale: 200 / 72,
    outDir,
    prefix: base,
    format: 'jpeg',
  });
  return 0;
}
