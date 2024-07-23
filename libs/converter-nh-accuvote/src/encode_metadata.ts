import { BallotMetadata, Election, SheetOf } from '@votingworks/types';
import { QrCodeData, encodeMetadataInQrCode } from '@votingworks/hmpb-layout';
import { createCanvas } from 'canvas';
import { assertDefined, iter } from '@votingworks/basics';
import { PDFDocument } from 'pdf-lib';
import { Buffer } from 'buffer';
import { PdfReader } from './pdf_reader';

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
    const qrCodeEmbed = await pdf.embedPng(qrCode);
    const qrCodeDimensions = qrCodeEmbed.scale(0.3);
    page.drawImage(qrCodeEmbed, {
      ...qrCodeDimensions,
      x: 16,
      y: 4,
    });
  }
  return await pdf.save();
}
