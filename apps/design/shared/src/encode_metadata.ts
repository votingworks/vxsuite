import { Election, HmpbBallotPageMetadata } from '@votingworks/types';
import { encodeHmpbBallotPageMetadata } from '@votingworks/ballot-encoder';
import { qrcodegen } from './qrcodegen';
import { range } from './util';

const { QrCode } = qrcodegen;

type Bit = 0 | 1;
export type QrCodeData = Array<Bit[]>;

export function encodeMetadataInQrCode(
  election: Election,
  metadata: HmpbBallotPageMetadata
): QrCodeData {
  const encodedMetadata = encodeHmpbBallotPageMetadata(election, metadata);
  const qrCode = QrCode.encodeBinary(
    Array.from(encodedMetadata),
    QrCode.Ecc.LOW
  );
  return range(0, qrCode.size).map((x) =>
    range(0, qrCode.size).map((y) => (qrCode.getModule(x, y) ? 1 : 0))
  );
}
