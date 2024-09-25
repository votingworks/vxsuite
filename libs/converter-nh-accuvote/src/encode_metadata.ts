import { iter } from '@votingworks/basics';
import { QrCodeData, encodeMetadataInQrCode } from '@votingworks/hmpb-layout';
import { BallotMetadata, Election, SheetOf } from '@votingworks/types';
import { PDFDocument, PDFPage, cmyk } from 'pdf-lib';

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

function qrCodeToSvgPath(qrCode: QrCodeData, { scale = 1 } = {}): string {
  return iter(qrCode)
    .flatMap((col, x) =>
      iter(col).filterMap((bit, y) =>
        bit
          ? `M${x * scale},${y * scale}h${scale}v${scale}h-${scale}z`
          : undefined
      )
    )
    .join();
}

function drawQrCodeOnPage(page: PDFPage, qrCode: QrCodeData): void {
  const svgPath = qrCodeToSvgPath(qrCode, {
    scale: 1.8,
  });
  page.drawSvgPath(svgPath, {
    x: 22.5,
    y: 56,
    color: cmyk(0, 0, 0, 1),
  });
}

/**
 * Encodes the metadata into a QR code for the front and back pages of the
 * ballot PDF and embeds the QR code image on each page.
 */
export async function addQrCodeMetadataToBallotPdf(
  document: PDFDocument,
  election: Election,
  metadata: BallotMetadata
): Promise<void> {
  const qrCodes = await encodeMetadata(election, metadata);
  const pages = document.getPages();

  for (const [page, qrCode] of iter(pages).zip(qrCodes)) {
    drawQrCodeOnPage(page, qrCode);
  }
}
