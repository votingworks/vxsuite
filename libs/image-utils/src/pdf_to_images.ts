import { range } from '@votingworks/basics';
import type { GrayImageData, RgbaImageData, Size } from '@votingworks/types';
import { createGrayImageData, createImageData } from './image_data.js';

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
  /** @default 'white' */
  background?: 'white' | 'transparent';
  color?: 'rgba' | 'gray';

  /** @default 1 */
  scale?: number;
}

/** Loaded lazily so importing this module never loads the native addon. */
async function loadNapi() {
  return await import('../index.js');
}

/** Returns the size of each page of a PDF in PDF points. */
export async function getPdfPageSizes(pdfBytes: Uint8Array): Promise<Size[]> {
  const napi = await loadNapi();
  return await napi.getPdfPageSizes(pdfBytes);
}

/** Returns the number of pages in a PDF. */
export async function getPdfPageCount(pdfBytes: Uint8Array): Promise<number> {
  return (await getPdfPageSizes(pdfBytes)).length;
}

/** Renders PDF pages as images. */
export function pdfToImages(
  pdfBytes: Uint8Array,
  opts: PdfToImagesOptions & { color: 'rgba' }
): AsyncIterable<PdfPage<RgbaImageData>>;

/** Renders PDF pages as images. */
export function pdfToImages(
  pdfBytes: Uint8Array,
  opts: PdfToImagesOptions & { color: 'gray' }
): AsyncIterable<PdfPage<GrayImageData>>;

/** Renders PDF pages as images. */
export function pdfToImages(
  pdfBytes: Uint8Array,
  opts?: PdfToImagesOptions
): AsyncIterable<PdfPage>;

/**
 * Renders PDF pages as images, rendering up to one page per CPU in parallel.
 */
export async function* pdfToImages(
  pdfBytes: Uint8Array,
  opts: PdfToImagesOptions = {}
): AsyncIterable<PdfPage<RgbaImageData | GrayImageData>> {
  const { background = 'white', color, scale = 1 } = opts;
  const napi = await loadNapi();
  const pageCount = (await napi.getPdfPageSizes(pdfBytes)).length;
  const batchSize = navigator.hardwareConcurrency;

  for (let start = 0; start < pageCount; start += batchSize) {
    const images = await napi.renderPdfPages(
      pdfBytes,
      range(start, Math.min(start + batchSize, pageCount)),
      scale,
      background === 'transparent',
      color === 'gray' ? 'gray' : 'rgba'
    );

    for (const [offset, { data, width, height }] of images.entries()) {
      const pixels = new Uint8ClampedArray(
        data.buffer,
        data.byteOffset,
        data.byteLength
      );
      yield {
        pageCount,
        pageNumber: start + offset + 1,
        page:
          color === 'gray'
            ? createGrayImageData(pixels, width, height)
            : createImageData(pixels, width, height),
      };
    }
  }
}
