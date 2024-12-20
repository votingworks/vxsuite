import { assert } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import {
  Canvas,
  CanvasRenderingContext2D,
  ImageData,
  createCanvas,
} from 'canvas';
import {
  CanvasFactory,
  GlobalWorkerOptions,
  PDFDocumentProxy,
  getDocument,
} from 'pdfjs-dist';

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
    create: (width, height) => {
      assert(width > 0 && height > 0, 'Invalid canvas size');
      const canvas = createCanvas(width, height);
      const context = canvas.getContext('2d');
      return {
        canvas,
        context,
      };
    },

    reset: (canvasAndContext, width, height) => {
      assert(canvasAndContext.canvas, 'Canvas is not specified');
      assert(width > 0 && height > 0, 'Invalid canvas size');
      canvasAndContext.canvas.width = width;
      canvasAndContext.canvas.height = height;
    },

    destroy: (canvasAndContext) => {
      assert(canvasAndContext.canvas, 'Canvas is not specified');

      // Zeroing the width and height cause Firefox to release graphics
      // resources immediately, which can greatly reduce memory consumption.
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
      canvasAndContext.canvas = undefined;
      canvasAndContext.context = undefined;
    },
  };
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
      canvasContext: context as unknown as globalThis.CanvasRenderingContext2D,
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
 * Parse PDF data with `pdf.js` to get a object with the number of pages and
 * viewport size, among other metadata. Useful when you want to inspect PDF
 * metadata but don't need to render the PDF.
 */
export async function parsePdf(pdfBytes: Buffer): Promise<PDFDocumentProxy> {
  const pdf = await getDocument(pdfBytes).promise;
  return pdf;
}

/**
 * Allow setting the `workerSrc` option for `pdfjs-dist` for use in the browser.
 */
export function setPdfRenderWorkerSrc(workerSrc: string): void {
  // See `setupProxy.js` for more details.
  GlobalWorkerOptions.workerSrc = workerSrc;
}
