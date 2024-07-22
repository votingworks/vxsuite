import { assertDefined, iter } from '@votingworks/basics';
import { encodeMetadataInQrCode, QrCodeData } from '@votingworks/hmpb-layout';
import { BallotMetadata, Election, SheetOf } from '@votingworks/types';
import { cmyk, PDFDocument, PDFPage } from 'pdf-lib';
import { PdfReader } from './pdf_reader';

/**
 * Encode ballot page metadata into either a QR code or a series of timing marks.
 */
export function encodeMetadata(
  election: Election,
  metadata: BallotMetadata
): Promise<SheetOf<QrCodeData>> {
  return Promise.all([
    encodeMetadataInQrCode(election, { ...metadata, pageNumber: 1 }),
    encodeMetadataInQrCode(election, { ...metadata, pageNumber: 2 }),
  ]);
}

function qrCodeToSvgPath(qrCode: QrCodeData): string {
  const path = [];
  for (let x = 0; x < qrCode.length; x += 1) {
    for (let y = 0; y < qrCode.length; y += 1) {
      if (assertDefined(qrCode[x])[y] === 1) {
        path.push(`M${x},${y}h1v1h-1z`);
      }
    }
  }
  return path.join('');
}

function drawQrCodeOnPage(page: PDFPage, qrCode: QrCodeData): void {
  const svgPath = qrCodeToSvgPath(qrCode);
  page.drawSvgPath(svgPath, {
    x: 22.5,
    y: 38.5,
    color: cmyk(0, 0, 0, 1),
  });
}

/**
 * Encodes the metadata into a QR code for the front and back pages of the
 * ballot PDF and embeds the QR code image on each page.
 */
export async function addQrCodeMetadataToBallotPdf(
  election: Election,
  metadata: BallotMetadata,
  pdfReader: PdfReader,
  pages: [number, number]
): Promise<Uint8Array> {
  const qrCodes = await encodeMetadata(election, metadata);
  const pdfOriginal = await PDFDocument.load(pdfReader.getOriginalData());
  const pdf = await PDFDocument.create();

  const [frontPage, backPage] = await pdf.copyPages(pdfOriginal, [
    pages[0] - 1,
    pages[1] - 1,
  ]);

  pdf.addPage(frontPage);
  pdf.addPage(backPage);

  for (const [page, qrCode] of iter(pdf.getPages()).zip(qrCodes)) {
    drawQrCodeOnPage(page, qrCode);
  }
  return await pdf.save();
}
