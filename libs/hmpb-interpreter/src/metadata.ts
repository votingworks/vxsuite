import { BallotPageMetadata, DetectQRCode, BallotLocales } from './types'
import defined from './utils/defined'
import * as qrcode from './utils/qrcode'

export interface DetectOptions {
  detectQRCode?: DetectQRCode
}

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

  const primaryLocaleCode = searchParams.get('l1') ?? undefined
  const secondaryLocaleCode = searchParams.get('l2') ?? undefined
  let locales: BallotLocales | undefined

  if (primaryLocaleCode) {
    if (secondaryLocaleCode) {
      locales = { primary: primaryLocaleCode, secondary: secondaryLocaleCode }
    } else {
      locales = { primary: primaryLocaleCode }
    }
  }

  const [typeTestBallot] = type.split('', 2)
  const [pageInfoNumber, pageInfoCount] = pageInfo.split('-', 2)

  const isTestBallot = typeTestBallot === 't'

  const pageNumber = parseInt(pageInfoNumber, 10)
  const pageCount = parseInt(pageInfoCount, 10)

  return {
    locales,
    ballotStyleId,
    precinctId,
    isTestBallot,
    pageCount,
    pageNumber,
  }
}

export function fromString(text: string): BallotPageMetadata {
  return decodeSearchParams(new URL(text).searchParams)
}

export function fromBytes(data: Buffer): BallotPageMetadata {
  return fromString(new TextDecoder().decode(data))
}

export async function detect(
  imageData: ImageData,
  { detectQRCode = qrcode.default }: DetectOptions = {}
): Promise<DetectResult> {
  const result = await detectQRCode(imageData)

  if (!result) {
    throw new MetadataDecodeError('Expected QR code not found.')
  }

  return {
    metadata: fromBytes(result.data),
    flipped: result.rightSideUp === false,
  }
}
