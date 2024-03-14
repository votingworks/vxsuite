import { assert, assertDefined } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { Canvas, createCanvas, ImageData } from '@napi-rs/canvas';
import { promises as fs } from 'fs';
import { basename, dirname, extname, join } from 'path';
import { CanvasFactory, getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { writeImageData } from './image_data';

// Extend `pdfjs-dist`'s `render` function to include `canvasFactory`.
declare module 'pdfjs-dist' {
  interface CanvasAndContext {
    canvas?: Canvas;
    context?: CanvasRenderingContext2D;
  }

  interface CanvasFactory {
    create(width: number, height: number): CanvasAndContext;
    reset(
      canvasAndContext: CanvasAndContext,
      width: number,
      height: number
    ): void;
    destroy(canvasAndContext: CanvasAndContext): void;
  }

  // eslint-disable-next-line vx/gts-identifiers
  interface PDFRenderParams {
    canvasFactory?: CanvasFactory;
  }
}

/* eslint-disable no-param-reassign */
/**
 * @see https://github.com/mozilla/pdf.js/issues/9667#issuecomment-471159204
 */
function buildCanvasFactory(): CanvasFactory {
  return {
    create: (width: number, height: number) => {
      assert(width > 0 && height > 0, 'Invalid canvas size');
      const canvas = createCanvas(width, height);
      const context = canvas.getContext('2d');
      return {
        canvas,
        context,
      };
    },

    reset: (canvasAndContext: any, width: number, height: number) => {
      assert(canvasAndContext.canvas, 'Canvas is not specified');
      assert(width > 0 && height > 0, 'Invalid canvas size');
      canvasAndContext.canvas.width = width;
      canvasAndContext.canvas.height = height;
    },

    destroy: (canvasAndContext: any) => {
      assert(canvasAndContext.canvas, 'Canvas is not specified');

      // Zeroing the width and height cause Firefox to release graphics
      // resources immediately, which can greatly reduce memory consumption.
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
      canvasAndContext.canvas = undefined;
      canvasAndContext.context = undefined;
    },
  } as unknown as CanvasFactory;
}
/* eslint-enable no-param-reassign */

/**
 * A page of a PDF document.
 */
export interface PdfPage {
  readonly pageNumber: number;
  readonly pageCount: number;
  readonly page: ImageData;
}

/**
 * Renders PDF pages as images.
 */
export async function* pdfToImages(
  pdfBytes: Buffer,
  { scale = 1 } = {}
): AsyncIterable<PdfPage> {
  const canvas = createCanvas(0, 0);
  const context = canvas.getContext('2d');
  const pdf = await getDocument(pdfBytes).promise;

  // Yes, 1-indexing is correct.
  // https://github.com/mozilla/pdf.js/blob/6ffcedc24bba417694a9d0e15eaf16cadf4dad15/src/display/api.js#L2457-L2463
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      canvasFactory: buildCanvasFactory(),
    }).promise;

    yield {
      pageCount: pdf.numPages,
      pageNumber: i,
      page: context.getImageData(0, 0, canvas.width, canvas.height),
    };
  }
}

/**
 * Allow setting the `workerSrc` option for `pdfjs-dist` for use in the browser.
 */
export function setPdfRenderWorkerSrc(workerSrc: string): void {
  // See `setupProxy.js` for more details.
  GlobalWorkerOptions.workerSrc = workerSrc;
}

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
