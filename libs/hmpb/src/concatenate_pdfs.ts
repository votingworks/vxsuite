import { PDFDocument } from 'pdf-lib';

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
  return Uint8Array.from(await combinedPdf.save());
}
