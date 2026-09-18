import { CreateOptions, PDFDocument } from 'pdf-lib';

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

/**
 * Concatenates PDF documents into a single document, preserving the order
 * given. A document may appear more than once, since loading does not consume
 * the input buffer.
 *
 * Metadata is left untouched so that the same inputs always produce the same
 * bytes; `pdf-lib` would otherwise stamp the current time into the result.
 */
export async function concatenatePdfs(
  pdfs: Uint8Array[],
  createOptions?: CreateOptions
): Promise<Uint8Array> {
  const merged = await PDFDocument.create(createOptions);
  for (const pdfBytes of pdfs) {
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = await merged.copyPages(pdf, pdf.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }
  return merged.save();
}
