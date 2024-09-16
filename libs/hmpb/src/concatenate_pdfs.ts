import { Buffer } from 'node:buffer';
import { PDFDocument } from 'pdf-lib';

export async function concatenatePdfs(pdfs: Buffer[]): Promise<Buffer> {
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
  return Buffer.from(await combinedPdf.save());
}
