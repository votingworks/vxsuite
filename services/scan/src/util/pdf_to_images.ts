import { assert } from '@votingworks/utils';
import { Buffer } from 'buffer';
import { Canvas, createCanvas } from 'canvas';
import { getDocument, CanvasFactory } from 'pdfjs-dist';

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
function buildNodeCanvasFactory(): CanvasFactory {
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
 * Renders PDF pages as images.
 */
export async function* pdfToImages(
  pdfBytes: Buffer,
  { scale = 1 } = {}
): AsyncGenerator<{ pageNumber: number; pageCount: number; page: ImageData }> {
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
      canvasContext: context,
      viewport,
      canvasFactory: buildNodeCanvasFactory(),
    }).promise;

    yield {
      pageCount: pdf.numPages,
      pageNumber: i,
      page: context.getImageData(0, 0, canvas.width, canvas.height),
    };
  }
}
