/**
 * A series of bytes to be sent to the paper handler, formatted as required
 * by that device, to print a bitmap.
 */
export interface PaperHandlerBitmap {
  data: Uint8Array;
  width: number;
}

/**
 * A list of paper handler bitmaps, with nulls representing completely empty chunks.
 */
export type PaperHandlerBitmapSeries = Array<PaperHandlerBitmap | null>;
