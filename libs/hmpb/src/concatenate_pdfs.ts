import { PDFDocument } from 'pdf-lib';
import { normalizePdf } from './normalize_pdf';

export async function concatenatePdfs(pdfs: Uint8Array[]): Promise<Uint8Array> {
  const combinedPdf = await PDFDocument.create();
  for (const pdf of pdfs) {
    const pdfDoc = await PDFDocument.load(pdf);
    const copiedPages = await combinedPdf.copyPages(
      pdfDoc,
      pdfDoc.getPageIndices()
    );
    for (const page of copiedPages) {
      combinedPdf.addPage(page);
    }
  }
  // useObjectStreams: false avoids pdf-lib compressing objects into ObjStm
  // entries with zlib, which produces non-deterministic output. The trade-off
  // is a tiny size increase (~0.2%) but guarantees byte-identical output
  // across runs.
  const result = Uint8Array.from(
    await combinedPdf.save({ useObjectStreams: false })
  );
  return normalizePdf(result);
}
