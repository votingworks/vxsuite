import { Election, HmpbBallotPageMetadata } from '@votingworks/types';
import { encodeHmpbBallotPageMetadata } from '@votingworks/ballot-encoder';
import { range } from '@votingworks/basics';
import { qrcodegen } from './qrcodegen';

const { QrCode } = qrcodegen;

type Bit = 0 | 1;
export type QrCodeData = Array<Bit[]>;

export function encodeInQrCode(data: Uint8Array): QrCodeData {
  const qrCode = QrCode.encodeBinary(Array.from(data), QrCode.Ecc.LOW);
  return range(0, qrCode.size).map((x) =>
    range(0, qrCode.size).map((y) => (qrCode.getModule(x, y) ? 1 : 0))
  );
}

export function encodeMetadataInQrCode(
  election: Election,
  metadata: HmpbBallotPageMetadata
): QrCodeData {
  const encodedMetadata = encodeHmpbBallotPageMetadata(election, metadata);
  return encodeInQrCode(encodedMetadata);
}
