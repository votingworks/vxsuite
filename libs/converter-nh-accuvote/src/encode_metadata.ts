import {
  BallotLayout,
  Election,
  HmpbBallotPageMetadata,
} from '@votingworks/types';
import { QrCodeData, encodeMetadataInQrCode } from '@votingworks/hmpb-layout';
import { createCanvas } from 'canvas';
import { assertDefined } from '@votingworks/basics';

function qrCodeDataToPng(data: QrCodeData): ImageData {
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
  return ctx.getImageData(0, 0, sizePixels, sizePixels);
}

/**
 * Encode ballot page metadata into either a QR code or a series of timing marks.
 */
export function encodeMetadata(
  election: Election,
  metadata: HmpbBallotPageMetadata,
  encoding: BallotLayout['metadataEncoding']
): [ImageData, ImageData] {
  if (encoding === 'qr-code') {
    return [
      qrCodeDataToPng(
        encodeMetadataInQrCode(election, { ...metadata, pageNumber: 1 })
      ),
      qrCodeDataToPng(
        encodeMetadataInQrCode(election, { ...metadata, pageNumber: 2 })
      ),
    ];
  }
  throw new Error('Timing mark encoding not yet implemented');
}
