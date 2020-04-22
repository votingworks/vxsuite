import { BallotPageMetadata, Rect } from './types'
import crop from './utils/crop'
import defined from './utils/defined'
import { flipRectVH } from './utils/geometry'
import * as qrcode from './utils/qrcode'

export interface DetectOptions {
  decodeQRCode?: DecodeQRCode
  searchBounds?: Rect
}

export type DecodeQRCode = (imageData: ImageData) => Promise<Buffer | undefined>

export interface DetectResult {
  metadata: BallotPageMetadata
  flipped: boolean
}

export class MetadataDecodeError extends Error {}

export function decodeSearchParams(
  searchParams: URLSearchParams
): BallotPageMetadata {
  const type = defined(searchParams.get('t'))
  const precinctId = defined(searchParams.get('pr'))
  const ballotStyleId = defined(searchParams.get('bs'))
  const pageInfo = defined(searchParams.get('p'))

  const [typeTestBallot] = type.split('', 2)
  const [pageInfoNumber, pageInfoCount] = pageInfo.split('-', 2)

  const isTestBallot = typeTestBallot === 't'

  const pageNumber = parseInt(pageInfoNumber, 10)
  const pageCount = parseInt(pageInfoCount, 10)

  return {
    ballotStyleId,
    precinctId,
    isTestBallot,
    pageCount,
    pageNumber,
  }
}

async function detectInBounds(
  imageData: ImageData,
  { decodeQRCode, searchBounds }: Required<DetectOptions>
): Promise<BallotPageMetadata | undefined> {
  const cropped = crop(imageData, searchBounds)
  const data = await decodeQRCode(cropped)

  if (!data) {
    return
  }

  const qrtext = new TextDecoder().decode(data)
  return decodeSearchParams(new URL(qrtext).searchParams)
}

export async function detect(
  imageData: ImageData,
  { decodeQRCode = qrcode.decode, searchBounds }: DetectOptions = {}
): Promise<DetectResult> {
  if (!searchBounds) {
    const x = Math.floor((imageData.width * 3) / 4)
    const y = Math.floor((imageData.height * 3) / 4)
    searchBounds = {
      x,
      y,
      width: imageData.width - x,
      height: imageData.height - y,
    }
  }

  const metadata = await detectInBounds(imageData, {
    decodeQRCode,
    searchBounds,
  })

  if (metadata) {
    return { metadata, flipped: false }
  }

  const searchBoundsFlipped = flipRectVH(
    { x: 0, y: 0, width: imageData.width, height: imageData.height },
    searchBounds
  )
  const metadataFlipped = await detectInBounds(imageData, {
    decodeQRCode,
    searchBounds: searchBoundsFlipped,
  })

  if (metadataFlipped) {
    return {
      metadata: metadataFlipped,
      flipped: true,
    }
  }

  throw new MetadataDecodeError('Expected QR code not found.')
}
