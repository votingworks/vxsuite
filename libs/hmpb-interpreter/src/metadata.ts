import { BallotPageMetadata, DetectQRCode } from './types'
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

export async function detect(
  imageData: ImageData,
  { detectQRCode = qrcode.default }: DetectOptions = {}
): Promise<DetectResult> {
  const result = await detectQRCode(imageData)

  if (!result) {
    throw new MetadataDecodeError('Expected QR code not found.')
  }

  const qrtext = new TextDecoder().decode(result.data)
  const metadata = decodeSearchParams(new URL(qrtext).searchParams)
  return { metadata, flipped: result.rightSideUp === false }
}
