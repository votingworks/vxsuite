import { assertDefined, iter } from '@votingworks/basics';
import { QrCodeData, encodeMetadataInQrCode } from '@votingworks/hmpb-layout';
import { BallotMetadata, Election, SheetOf } from '@votingworks/types';
import { Buffer } from 'buffer';
import { createCanvas } from 'canvas';
import { PDFDocument } from 'pdf-lib';

async function qrCodeDataToPng(data: QrCodeData): Promise<Buffer> {
  // QR codes are supposed to be surrounded by 4 modules of white space
  const marginModules = 4;
  const ppi = 200;
  const maxSizeInches = 1;
  const maxSizePixels = ppi * maxSizeInches;
  const totalModules = data.length + marginModules * 2;
  const moduleSize = Math.floor(maxSizePixels / totalModules);
  const sizePixels = totalModules * moduleSize;
  const canvas = createCanvas(sizePixels, sizePixels);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, sizePixels, sizePixels);
  ctx.fillStyle = 'black';
  for (let x = 0; x < data.length; x += 1) {
    for (let y = 0; y < data.length; y += 1) {
      if (assertDefined(data[x])[y] === 1) {
        ctx.fillRect(
          (x + marginModules) * moduleSize,
          (y + marginModules) * moduleSize,
          moduleSize,
          moduleSize
        );
      }
    }
  }
  return new Promise((resolve, reject) => {
    canvas.toBuffer((err, result) => (err ? reject(err) : resolve(result)));
  });
}

/**
 * Encode ballot page metadata into either a QR code or a series of timing marks.
 */
export function encodeMetadata(
  election: Election,
  metadata: BallotMetadata
): Promise<SheetOf<Buffer>> {
  return Promise.all([
    qrCodeDataToPng(
      encodeMetadataInQrCode(election, { ...metadata, pageNumber: 1 })
    ),
    qrCodeDataToPng(
      encodeMetadataInQrCode(election, { ...metadata, pageNumber: 2 })
    ),
  ]);
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
  for (const [page, qrCode] of iter(pages).zip(qrCodes).toArray()) {
    const qrCodeEmbed = await document.embedPng(qrCode);
    const qrCodeDimensions = qrCodeEmbed.scale(0.22);
    page.drawImage(qrCodeEmbed, {
      ...qrCodeDimensions,
      x: 16,
      y: 0,
    });
  }
}
