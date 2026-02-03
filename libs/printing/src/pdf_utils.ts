import { PDFDocument } from 'pdf-lib';

/**
 * Returns the number of pages in a PDF document.
 *
 * Uses pdf-lib which does NOT consume the input buffer (unlike pdfjs-dist),
 * so the Uint8Array remains usable after this call.
 */
export async function getPdfPageCount(pdfBytes: Uint8Array): Promise<number> {
  const pdf = await PDFDocument.load(pdfBytes);
  return pdf.getPageCount();
}
