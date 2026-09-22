import { err, ok, Result } from '@votingworks/basics';
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

/**
 * Concatenates PDF documents into a single document, preserving order.
 */
export async function concatenatePdfs(
  pdfs: Uint8Array[],
  { maxSizeBytes }: { maxSizeBytes?: number } = {}
): Promise<Result<Uint8Array, Error>> {
  if (maxSizeBytes !== undefined) {
    const totalSizeBytes = pdfs.reduce(
      (total, pdf) => total + pdf.byteLength,
      0
    );
    if (totalSizeBytes > maxSizeBytes) {
      return err(
        new Error(
          `Output PDF would be too large: ${totalSizeBytes} exceeds ${maxSizeBytes} max bytes`
        )
      );
    }
  }

  // `updateMetadata: false` prevents adding a timestamp to the output.
  // Timestamp makes the result nondeterministic and harder to test.
  const merged = await PDFDocument.create({ updateMetadata: false });
  for (const pdfBytes of pdfs) {
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = await merged.copyPages(pdf, pdf.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }
  const pdf = await merged.save();
  return ok(pdf);
}
