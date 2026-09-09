import { createCanvas } from '@napi-rs/canvas';
import { Buffer } from 'node:buffer';
import { CanvasGradient, CanvasPattern } from 'canvas';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { GrayImageData, RgbaImageData } from '@votingworks/types';
import { createImageData, toGrayScale } from './image_data';

/**
 * A page of a PDF document.
 */
export interface PdfPage<ImageData = RgbaImageData> {
  readonly pageNumber: number;
  readonly pageCount: number;
  readonly page: ImageData;
}

/** Options for {@link pdfToImages}. */
export interface PdfToImagesOptions {
  background?: string | CanvasGradient | CanvasPattern;
  color?: 'rgba' | 'gray';

  /** @default 1 */
  scale?: number;
}

/**
 * Renders PDF pages as images. This function consumes the data source, leaving
 * the caller with an empty `Uint8Array` when this function resolves. Be sure to
 * clone the data if you need it afterward.
 */
export function pdfToImages(
  pdfBytes: Uint8Array,
  opts: PdfToImagesOptions & { color: 'rgba' }
): AsyncIterable<PdfPage<RgbaImageData>>;

/**
 * Renders PDF pages as images. This function consumes the data source, leaving
 * the caller with an empty `Uint8Array` when this function resolves. Be sure to
 * clone the data if you need it afterward.
 */
export function pdfToImages(
  pdfBytes: Uint8Array,
  opts: PdfToImagesOptions & { color: 'gray' }
): AsyncIterable<PdfPage<GrayImageData>>;

/**
 * Renders PDF pages as images. This function consumes the data source, leaving
 * the caller with an empty `Uint8Array` when this function resolves. Be sure to
 * clone the data if you need it afterward.
 */
export function pdfToImages(
  pdfBytes: Uint8Array,
  opts?: PdfToImagesOptions
): AsyncIterable<PdfPage>;

/**
 * Renders PDF pages as images. This function consumes the data source, leaving
 * the caller with an empty `Uint8Array` when this function resolves. Be sure to
 * clone the data if you need it afterward.
 */
export async function* pdfToImages(
  pdfBytes: Uint8Array,
  opts: PdfToImagesOptions = {}
): AsyncIterable<PdfPage<RgbaImageData | GrayImageData>> {
  const { background, color, scale = 1 } = opts;
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const canvas = createCanvas(0, 0);
  const context = canvas.getContext('2d');

  // Consumes `pdfBytes` here:
  const pdf = await pdfjs.getDocument({
    // pdfjs-dist wants a `Uint8Array`, not a `Buffer`
    data: Buffer.isBuffer(pdfBytes)
      ? new Uint8Array(
          pdfBytes.buffer,
          pdfBytes.byteOffset,
          pdfBytes.byteLength
        )
      : pdfBytes,
    // Defense in depth: never evaluate JS embedded in PDFs (CVE-2024-4367).
    isEvalSupported: false,
  }).promise;

  // Yes, 1-indexing is correct.
  // https://github.com/mozilla/pdf.js/blob/6ffcedc24bba417694a9d0e15eaf16cadf4dad15/src/display/api.js#L2457-L2463
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvas,
      viewport,
      background,
    }).promise;

    const { data, width, height } = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );

    yield {
      pageCount: pdf.numPages,
      pageNumber: i,
      page:
        color === 'gray'
          ? toGrayScale(data, width, height)
          : createImageData(data, width, height),
    };
  }
}

/**
 * Parse PDF data with `pdf.js` to get a object with the number of pages and
 * viewport size, among other metadata. Useful when you want to inspect PDF
 * metadata but don't need to render the PDF.
 *
 * Consumes `pdfBytes`, replacing it with an empty array.
 */
export async function parsePdf(
  pdfBytes: Uint8Array
): Promise<PDFDocumentProxy> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({
    data: pdfBytes,
    isEvalSupported: false,
  }).promise;
  return pdf;
}

/**
 * Parse PDF data with `pdf.js` to get the number of pages in the PDF. Useful
 * when you want to know how many pages are in a PDF without rendering it.
 *
 * Consumes `pdfBytes`, replacing it with an empty array.
 */
export async function getPdfPageCount(pdfBytes: Uint8Array): Promise<number> {
  const pdf = await parsePdf(pdfBytes);
  return pdf.numPages;
}
