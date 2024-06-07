import { PaperHandlerBitmapSeries } from '@votingworks/types';
import { Buffer } from 'buffer';

export interface PdfToCustomPaperHandlerBitmapSeriesOptions {
  width: number;
  whiteThreshold: number;
}

/**
 * Type of the Rust `rasterize` implementation.
 */
export function pdfToCustomPaperHandlerBitmapSeries(
  pdfData: Buffer,
  options: PdfToCustomPaperHandlerBitmapSeriesOptions
): PaperHandlerBitmapSeries;
