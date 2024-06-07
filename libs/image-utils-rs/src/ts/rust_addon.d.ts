import { PaperHandlerBitmapSeries } from '@votingworks/types';
import { Buffer } from 'buffer';

export interface PdfToCustomPaperHandlerBitmapSeriesOptions {
  scale: number;
  whiteThreshold: number;
}

/**
 * Type of the Rust `rasterize` implementation.
 */
export function pdfToCustomPaperHandlerBitmapSeries(
  pdfData: Buffer,
  options: PdfToCustomPaperHandlerBitmapSeriesOptions
): PaperHandlerBitmapSeries;

export interface ImageFileBuffer {
  width: number;
  height: number;
  data: Buffer;
  format: 'png' | 'jpeg';
}

export function pdfToImages(
  pdfData: Buffer,
  options: { scale: number }
): ImageFileBuffer[];
