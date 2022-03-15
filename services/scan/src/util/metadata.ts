import { encodeHmpbBallotPageMetadata } from '@votingworks/ballot-encoder';
import { metadataFromBytes } from '@votingworks/ballot-interpreter-vx';
import { BallotPageMetadata, ElectionDefinition } from '@votingworks/types';
import { BallotPageQrcode, SheetOf } from '../types';

function tryMetadataFromBytes(
  electionDefinition: ElectionDefinition,
  bytes: Buffer
): BallotPageMetadata | undefined {
  try {
    return metadataFromBytes(electionDefinition, bytes);
  } catch {
    return undefined;
  }
}

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
    const presentMetadata = tryMetadataFromBytes(
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
