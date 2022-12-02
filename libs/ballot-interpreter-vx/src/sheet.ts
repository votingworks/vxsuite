import { Buffer } from 'buffer';
import { encodeHmpbBallotPageMetadata } from '@votingworks/ballot-encoder';
import { ElectionDefinition, SheetOf } from '@votingworks/types';
import { tryFromBytes } from './metadata';
import { BallotPageQrcode, QrCodePageResult } from './utils/qrcode';

/**
 * Normalize sheet metadata as encoded using QR codes. Infers a single missing
 * HMPB QR code when possible.
 */
export function normalizeSheetMetadata(
  electionDefinition: ElectionDefinition,
  [frontQrcode, backQrcode]: SheetOf<BallotPageQrcode | undefined>
): SheetOf<BallotPageQrcode | undefined> {
  if (!frontQrcode === !backQrcode) {
    return [frontQrcode, backQrcode];
  }

  const presentQrcode = frontQrcode ?? backQrcode;

  if (presentQrcode) {
    const presentMetadata = tryFromBytes(
      electionDefinition,
      Buffer.from(presentQrcode.data)
    );

    if (presentMetadata) {
      const inferredQrcode: BallotPageQrcode = {
        data: encodeHmpbBallotPageMetadata(electionDefinition.election, {
          ...presentMetadata,
          pageNumber:
            presentMetadata.pageNumber % 2 === 0
              ? presentMetadata.pageNumber - 1
              : presentMetadata.pageNumber + 1,
        }),
        position: presentQrcode.position,
      };

      return presentQrcode === frontQrcode
        ? [frontQrcode, inferredQrcode]
        : [inferredQrcode, backQrcode];
    }
  }

  return [frontQrcode, backQrcode];
}

export function normalizeSheetOutput(
  electionDefinition: ElectionDefinition,
  output: SheetOf<QrCodePageResult>
): SheetOf<QrCodePageResult> {
  const [frontOutput, backOutput] = output;
  const [normalizedFrontMetadata, normalizedBackMetadata] =
    normalizeSheetMetadata(electionDefinition, [
      frontOutput.blank ? undefined : frontOutput.qrcode,
      backOutput.blank ? undefined : backOutput.qrcode,
    ]);
  return [
    { blank: !normalizedFrontMetadata, qrcode: normalizedFrontMetadata },
    { blank: !normalizedBackMetadata, qrcode: normalizedBackMetadata },
  ];
}
