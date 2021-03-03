import { encodeHMPBBallotPageMetadata } from '@votingworks/ballot-encoder'
import {
  BallotPageMetadata,
  metadataFromBytes,
} from '@votingworks/hmpb-interpreter'
import { Election } from '@votingworks/types'
import { BallotPageQrcode, SheetOf } from '../types'

/**
 * Normalize sheet metadata as encoded using QR codes. Infers a single missing
 * HMPB QR code when possible.
 */
export function normalizeSheetMetadata(
  election: Election,
  [frontQrcode, backQrcode]: SheetOf<BallotPageQrcode | undefined>
): SheetOf<BallotPageQrcode | undefined> {
  if (!frontQrcode === !backQrcode) {
    return [frontQrcode, backQrcode]
  }

  const presentQrcode = frontQrcode ?? backQrcode

  if (presentQrcode) {
    const presentMetadata = tryMetadataFromBytes(
      election,
      Buffer.from(presentQrcode.data)
    )

    if (presentMetadata) {
      const inferredQrcode: BallotPageQrcode = {
        data: encodeHMPBBallotPageMetadata(election, {
          ...presentMetadata,
          pageNumber:
            presentMetadata.pageNumber % 2 === 0
              ? presentMetadata.pageNumber - 1
              : presentMetadata.pageNumber + 1,
        }),
        position: presentQrcode.position,
      }

      return presentQrcode === frontQrcode
        ? [frontQrcode, inferredQrcode]
        : [inferredQrcode, backQrcode]
    }
  }

  return [frontQrcode, backQrcode]
}

function tryMetadataFromBytes(
  election: Election,
  bytes: Buffer
): BallotPageMetadata | undefined {
  try {
    return metadataFromBytes(election, bytes)
  } catch {
    return undefined
  }
}
